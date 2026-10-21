// MIGRATED FROM: netlify/functions/create-checkout-session.mjs
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  ApiRouteError,
  assertAuthenticatedUser,
  ensureAllowedOrigin,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedUser,
} from '../_lib/security';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// DECISION: le SDK Stripe côté serveur doit tourner sur le runtime Node.js.
export const runtime = 'nodejs';

function getSiteUrl(request: NextRequest) {
  const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host');
  if (host) {
    return `${protocol}://${host}`;
  }

  const explicitUrl = process.env.SITE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }

  throw new ApiRouteError('SITE_URL est manquante sur ce déploiement.', 500);
}

function normalizeReturnPath(rawPath: string) {
  if (!rawPath || !rawPath.startsWith('/') || rawPath.startsWith('//')) {
    return '/';
  }

  return rawPath;
}

function buildCheckoutReturnUrl(siteUrl: string, returnPath: string, status: 'success' | 'cancel') {
  const separator = returnPath.includes('?') ? '&' : '?';

  if (status === 'success') {
    return `${siteUrl}${returnPath}${separator}checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  }

  return `${siteUrl}${returnPath}${separator}checkout=cancel`;
}

async function getOrCreateStripeCustomer({
  userId,
  email,
  fullName,
}: {
  userId: string;
  email: string;
  fullName: string;
}) {
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

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  if (!stripe || !stripePriceId) {
    return jsonResponse(
      request,
      {
        error: 'Le paiement n’est pas encore configuré sur ce site.',
      },
      { status: 500 },
    );
  }

  try {
    ensureAllowedOrigin(request);
    const authenticatedUser = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const userId = String(payload.userId ?? '').trim();
    const fullName = String(payload.fullName ?? '').trim();
    const profileType = String(payload.profileType ?? '').trim();
    const returnPath = normalizeReturnPath(String(payload.returnPath ?? '').trim());

    if (!userId) {
      return jsonResponse(
        request,
        {
          error: 'Le compte Kloo doit être créé avant de lancer le paiement.',
        },
        { status: 400 },
      );
    }

    assertAuthenticatedUser(authenticatedUser, userId);
    const email = authenticatedUser.email?.trim().toLowerCase();
    if (!email) {
      throw new ApiRouteError('Email Kloo introuvable pour ce compte.', 400);
    }

    if (!admin) throw new ApiRouteError('La vérification de l’essai n’est pas configurée.', 503);
    const existing = await admin.from('subscriptions')
      .select('id, status, trial_ends_at, current_period_end_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    const access = existing.data;
    if (!access) throw new ApiRouteError('Démarre ton essai gratuit avant de t’abonner.', 409);
    const now = Date.now();
    if (access.status === 'active'
      || (access.status === 'trialing' && (!access.trial_ends_at || new Date(access.trial_ends_at).getTime() > now))
      || (['past_due', 'canceled'].includes(access.status) && access.current_period_end_at
        && new Date(access.current_period_end_at).getTime() > now)) {
      throw new ApiRouteError('Ton accès Kloo est encore actif. Le paiement sera disponible à la fin de l’essai.', 409);
    }
    const trialDays = 0;

    const configuredPrice = await stripe.prices.retrieve(stripePriceId);
    if (!configuredPrice.active || configuredPrice.unit_amount !== 199 || configuredPrice.currency !== 'eur'
      || configuredPrice.recurring?.interval !== 'month' || configuredPrice.recurring.interval_count !== 1) {
      throw new ApiRouteError('Le paiement par carte est temporairement indisponible. Contacte le support.', 503);
    }

    const customerId = await getOrCreateStripeCustomer({
      userId,
      email,
      fullName,
    });
    const siteUrl = getSiteUrl(request);

    const subscriptionData: any = {
      metadata: {
        user_id: userId,
        email,
        profile_type: profileType,
        trial_days: String(trialDays),
      },
    };

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
      subscription_data: subscriptionData,
      metadata: {
        user_id: userId,
        email,
        profile_type: profileType,
        trial_days: String(trialDays),
      },
      success_url: buildCheckoutReturnUrl(siteUrl, returnPath, 'success'),
      cancel_url: buildCheckoutReturnUrl(siteUrl, returnPath, 'cancel'),
    });

    return jsonResponse(
      request,
      {
        url: session.url,
        trialDays,
      },
    );
  } catch (error) {
    const status = error instanceof ApiRouteError ? error.status : 500;
    return jsonResponse(
      request,
      {
        error: error instanceof Error ? error.message : 'Checkout indisponible.',
      },
      { status },
    );
  }
}
