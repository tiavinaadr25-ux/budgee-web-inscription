// MIGRATED FROM: netlify/functions/create-checkout-session.mjs
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bdePromoCode = process.env.BUDGEE_BDE_CODE?.trim().toUpperCase() ?? null;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
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

  return 'https://budgeeapp.vercel.app';
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
    throw new Error('Stripe n’est pas configuré.');
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

export function OPTIONS() {
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (!stripe || !stripePriceId) {
    return NextResponse.json(
      {
        error: 'Stripe checkout n’est pas encore configuré sur ce site.',
      },
      { status: 500, headers: corsHeaders },
    );
  }

  try {
    const payload = await request.json();
    const userId = String(payload.userId ?? '').trim();
    const email = String(payload.email ?? '').trim().toLowerCase();
    const fullName = String(payload.fullName ?? '').trim();
    const profileType = String(payload.profileType ?? '').trim();
    const rawPromoCode = String(payload.promoCode ?? '').trim();
    const normalizedPromoCode = rawPromoCode.toUpperCase();

    if (!userId || !email) {
      return NextResponse.json(
        {
          error: 'Le compte Budgee doit être créé avant de lancer le paiement.',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const trialDays =
      normalizedPromoCode && bdePromoCode && normalizedPromoCode === bdePromoCode ? 14 : 7;
    const customerId = await getOrCreateStripeCustomer({
      userId,
      email,
      fullName,
    });
    const siteUrl = getSiteUrl(request);

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
          promo_code: normalizedPromoCode,
          trial_days: String(trialDays),
        },
      },
      metadata: {
        user_id: userId,
        email,
        profile_type: profileType,
        promo_code: normalizedPromoCode,
        trial_days: String(trialDays),
      },
      success_url: `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    return NextResponse.json(
      {
        url: session.url,
        trialDays,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Checkout indisponible.',
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
