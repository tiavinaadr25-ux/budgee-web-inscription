import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function getOrCreateStripeCustomer({ userId, email, fullName }) {
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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (!stripe || !stripePriceId) {
    return json(500, {
      error: 'Stripe checkout n’est pas encore configuré sur ce site.',
    });
  }

  try {
    const payload = JSON.parse(event.body ?? '{}');
    const userId = String(payload.userId ?? '').trim();
    const email = String(payload.email ?? '').trim().toLowerCase();
    const fullName = String(payload.fullName ?? '').trim();
    const profileType = String(payload.profileType ?? '').trim();
    const rawPromoCode = String(payload.promoCode ?? '').trim();
    const normalizedPromoCode = rawPromoCode.toUpperCase();

    if (!userId || !email) {
      return json(400, {
        error: 'Le compte Budgee doit être créé avant de lancer le paiement.',
      });
    }

    const trialDays =
      normalizedPromoCode && bdePromoCode && normalizedPromoCode === bdePromoCode ? 14 : 7;
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

    return json(200, {
      url: session.url,
      trialDays,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Checkout indisponible.',
    });
  }
};
