import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const authClient =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export class ApiRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: NextRequest) {
  const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host');
  return host ? normalizeOrigin(`${protocol}://${host}`) : null;
}

function getAllowedOrigins(request: NextRequest) {
  const allowedOrigins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  const configuredSiteOrigin = normalizeOrigin(process.env.SITE_URL?.trim());
  const requestOrigin = getRequestOrigin(request);

  if (configuredSiteOrigin) {
    allowedOrigins.add(configuredSiteOrigin);
  }

  if (requestOrigin) {
    allowedOrigins.add(requestOrigin);
  }

  return allowedOrigins;
}

export function ensureAllowedOrigin(request: NextRequest) {
  const origin = normalizeOrigin(request.headers.get('origin'));
  if (!origin) {
    return;
  }

  if (!getAllowedOrigins(request).has(origin)) {
    throw new ApiRouteError('Origin non autorisée.', 403);
  }
}

function getCorsHeaders(request: NextRequest) {
  const origin = normalizeOrigin(request.headers.get('origin'));
  if (!origin || !getAllowedOrigins(request).has(origin)) {
    return {} as Record<string, string>;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  request: NextRequest,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  const corsHeaders = getCorsHeaders(request);

  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export function optionsResponse(request: NextRequest) {
  ensureAllowedOrigin(request);
  return jsonResponse(request, { ok: true }, { status: 200 });
}

export async function requireAuthenticatedUser(request: NextRequest) {
  if (!authClient) {
    throw new ApiRouteError('Supabase public auth n’est pas configuré.', 500);
  }

  const authorizationHeader = request.headers.get('authorization') ?? '';
  if (!authorizationHeader.startsWith('Bearer ')) {
    throw new ApiRouteError('Session Budgee manquante.', 401);
  }

  const accessToken = authorizationHeader.slice('Bearer '.length).trim();
  if (!accessToken) {
    throw new ApiRouteError('Session Budgee invalide.', 401);
  }

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    throw new ApiRouteError('Session Budgee invalide.', 401);
  }

  return user;
}

export function assertAuthenticatedUser(user: User, expectedUserId: string) {
  if (!expectedUserId || user.id !== expectedUserId) {
    throw new ApiRouteError('Compte Budgee invalide.', 403);
  }
}
