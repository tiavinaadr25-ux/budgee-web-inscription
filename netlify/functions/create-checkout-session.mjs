import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// DEPRECATED: cette fonction Netlify legacy reste publiée uniquement pour compatibilité
// temporaire. Le flux principal Kloo passe désormais par /api/create-checkout-session.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
const authClient =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

class ApiRouteError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeOrigin(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigin(event) {
  const explicitOrigin = normalizeOrigin(process.env.SITE_URL?.trim());
  const forwardedProtocol = event.headers['x-forwarded-proto'] ?? 'https';
  const requestOrigin = normalizeOrigin(`${forwardedProtocol}://${event.headers.host ?? ''}`);
  const origin = normalizeOrigin(event.headers.origin);
  const localOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

  if (!origin) {
    return null;
  }

  if (origin === explicitOrigin || origin === requestOrigin || localOrigins.has(origin)) {
    return origin;
  }

  return null;
}

function json(statusCode, body, event) {
  const allowedOrigin = getAllowedOrigin(event);
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...(allowedOrigin
        ? {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            Vary: 'Origin',
          }
        : {}),
    },
    body: JSON.stringify(body),
  };
}

function getSiteUrl(event) {
  const explicitUrl = process.env.SITE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }

  const protocol = event.headers['x-forwarded-proto'] ?? 'https';
  const host = event.headers.host;
  return `${protocol}://${host}`;
}

async function requireAuthenticatedUser(event) {
  if (!authClient) {
    throw new ApiRouteError('Supabase public auth n’est pas configuré.', 500);
  }

  const authorizationHeader = event.headers.authorization ?? event.headers.Authorization ?? '';
  if (!authorizationHeader.startsWith('Bearer ')) {
    throw new ApiRouteError('Session Kloo manquante.', 401);
  }

  const accessToken = authorizationHeader.slice('Bearer '.length).trim();
  if (!accessToken) {
    throw new ApiRouteError('Session Kloo invalide.', 401);
  }

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    throw new ApiRouteError('Session Kloo invalide.', 401);
  }

  return user;
}

async function getOrCreateStripeCustomer({ userId, email, fullName }) {
  if (!stripe) {
    throw new Error('Le paiement n’est pas configuré.');
  }

  if (admin) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', userId)
      .not('provider_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.provider_customer_id) {
      return data.provider_customer_id;
    }
  }

  const customer = await stripe.customers.create({
    email,
    name: fullName || undefined,
    metadata: {
      user_id: userId,
    },
  });

  return customer.id;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true }, event);
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (!stripe || !stripePriceId) {
    return json(500, {
      error: 'Le paiement n’est pas encore configuré sur ce site.',
    }, event);
  }

  try {
    const authenticatedUser = await requireAuthenticatedUser(event);
    const payload = JSON.parse(event.body ?? '{}');
    const userId = String(payload.userId ?? '').trim();
    const fullName = String(payload.fullName ?? '').trim();
    const profileType = String(payload.profileType ?? '').trim();
    const email = authenticatedUser.email?.trim().toLowerCase();

    if (!userId || !email) {
      return json(400, {
        error: 'Le compte Kloo doit être créé avant de lancer le paiement.',
      }, event);
    }

    if (authenticatedUser.id !== userId) {
      return json(403, {
        error: 'Compte Kloo invalide.',
      }, event);
    }

    const trialDays = 7;
    const customerId = await getOrCreateStripeCustomer({
      userId,
      email,
      fullName,
    });
    const siteUrl = getSiteUrl(event);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      locale: 'fr',
      customer: customerId,
      client_reference_id: userId,
      payment_method_collection: 'always',
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          user_id: userId,
          email,
          profile_type: profileType,
          trial_days: String(trialDays),
        },
      },
      metadata: {
        user_id: userId,
        email,
        profile_type: profileType,
        trial_days: String(trialDays),
      },
      success_url: `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    return json(200, {
      url: session.url,
      trialDays,
    }, event);
  } catch (error) {
    const statusCode = error instanceof ApiRouteError ? error.statusCode : 500;
    return json(statusCode, {
      error: error instanceof Error ? error.message : 'Checkout indisponible.',
    }, event);
  }
};
