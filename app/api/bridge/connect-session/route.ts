import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const bridgeClientId = process.env.BRIDGE_CLIENT_ID;
const bridgeClientSecret = process.env.BRIDGE_CLIENT_SECRET;
const bridgeVersion = process.env.BRIDGE_VERSION?.trim() || '2025-01-15';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bridgeBaseUrl = 'https://api.bridgeapi.io/v3/aggregation';

// DECISION: la route Bridge reste en runtime Node.js pour garder un fetch serveur stable
// et éviter d’exposer les secrets Bridge au client.
export const runtime = 'nodejs';

class BridgeRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type BridgeResponse<T> = {
  data: T | null;
  status: number;
};

function getSiteUrl(request: NextRequest) {
  const explicitUrl = process.env.SITE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }

  const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host');
  return host ? `${protocol}://${host}` : 'https://budgeeapp.vercel.app';
}

async function parseBridgeResponse<T>(response: Response): Promise<BridgeResponse<T>> {
  const text = await response.text();

  if (!text) {
    return { data: null, status: response.status };
  }

  try {
    return { data: JSON.parse(text) as T, status: response.status };
  } catch {
    throw new BridgeRouteError('Réponse Bridge invalide.', 502);
  }
}

async function bridgeRequest<T>(
  path: string,
  init: RequestInit,
  validStatuses: number[] = [200, 201],
) {
  if (!bridgeClientId || !bridgeClientSecret) {
    throw new BridgeRouteError('Bridge n’est pas encore configuré.', 500);
  }

  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('Bridge-Version', bridgeVersion);
  headers.set('Client-Id', bridgeClientId);
  headers.set('Client-Secret', bridgeClientSecret);

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${bridgeBaseUrl}${path}`, {
    ...init,
    headers,
  });

  const { data, status } = await parseBridgeResponse<T & { message?: string }>(response);

  if (!validStatuses.includes(status)) {
    throw new BridgeRouteError(
      data?.message || `Bridge a renvoyé une erreur (${status}).`,
      status >= 400 && status < 600 ? status : 502,
    );
  }

  return data as T;
}

async function verifyBudgeeUser(userId: string, email: string) {
  if (!admin) {
    return {
      id: userId,
      email,
    };
  }

  const {
    data: { user },
    error,
  } = await admin.auth.admin.getUserById(userId);

  if (error || !user) {
    throw new BridgeRouteError('Compte Budgee introuvable.', 404);
  }

  const normalizedEmail = user.email?.trim().toLowerCase() ?? '';
  const providedEmail = email.trim().toLowerCase();

  if (providedEmail && normalizedEmail && providedEmail !== normalizedEmail) {
    throw new BridgeRouteError('Compte Budgee invalide.', 400);
  }

  return {
    id: user.id,
    email: normalizedEmail || providedEmail,
  };
}

async function ensureBridgeUser(externalUserId: string) {
  try {
    await bridgeRequest<{ uuid: string }>(
      '/users',
      {
        method: 'POST',
        body: JSON.stringify({
          external_user_id: externalUserId,
        }),
      },
      [200, 201, 409],
    );
  } catch (error) {
    if (
      error instanceof BridgeRouteError &&
      error.status === 409
    ) {
      return;
    }

    throw error;
  }
}

async function createBridgeAccessToken(externalUserId: string) {
  const data = await bridgeRequest<{
    access_token: string;
    expires_at: string;
    user: {
      uuid: string;
      external_user_id: string;
    };
  }>('/authorization/token', {
    method: 'POST',
    body: JSON.stringify({
      external_user_id: externalUserId,
    }),
  });

  if (!data.access_token) {
    throw new BridgeRouteError('Bridge n’a pas renvoyé de token.', 502);
  }

  return data;
}

async function createConnectSession({
  accessToken,
  email,
  callbackUrl,
}: {
  accessToken: string;
  email: string;
  callbackUrl: string;
}) {
  const payload: Record<string, unknown> = {
    capabilities: ['account_check'],
    callback_url: callbackUrl,
  };

  if (email) {
    payload.user_email = email;
  }

  const data = await bridgeRequest<{
    id: string;
    url: string;
  }>(
    '/connect-sessions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!data.url) {
    throw new BridgeRouteError('Bridge n’a pas renvoyé d’URL de connexion.', 502);
  }

  return data;
}

export function OPTIONS() {
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (!bridgeClientId || !bridgeClientSecret) {
    return NextResponse.json(
      { error: 'Bridge n’est pas encore configuré.' },
      { status: 500, headers: corsHeaders },
    );
  }

  try {
    const payload = await request.json();
    const rawUserId = String(payload.userId ?? '').trim();
    const rawEmail = String(payload.email ?? '').trim().toLowerCase();
    const rawCallbackUrl = String(payload.callbackUrl ?? '').trim();

    if (!rawUserId) {
      return NextResponse.json(
        { error: 'Le compte Budgee doit être identifié avant de connecter la banque.' },
        { status: 400, headers: corsHeaders },
      );
    }

    const user = await verifyBudgeeUser(rawUserId, rawEmail);
    await ensureBridgeUser(user.id);

    const token = await createBridgeAccessToken(user.id);
    const siteUrl = getSiteUrl(request);
    const callbackUrl = rawCallbackUrl || `${siteUrl}/?bridge=connected`;
    const connectSession = await createConnectSession({
      accessToken: token.access_token,
      email: user.email,
      callbackUrl,
    });

    return NextResponse.json(
      {
        url: connectSession.url,
        sessionId: connectSession.id,
        bridgeUserId: token.user.uuid,
        callbackUrl,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const status =
      error instanceof BridgeRouteError ? error.status : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Connexion bancaire indisponible pour le moment.',
      },
      { status, headers: corsHeaders },
    );
  }
}
