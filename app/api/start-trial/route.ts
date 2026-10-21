import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import {
  ApiRouteError, ensureAllowedOrigin, jsonResponse, optionsResponse, requireAuthenticatedUser,
} from '../_lib/security';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const priceId = process.env.STRIPE_PRICE_ID;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export const runtime = 'nodejs';
const accessColumns = 'id, status, trial_ends_at, current_period_end_at, cancel_at_period_end';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    ensureAllowedOrigin(request);
    const user = await requireAuthenticatedUser(request);
    if (!user.email_confirmed_at) {
      throw new ApiRouteError('Confirme ton email pour démarrer ton essai.', 403);
    }
    if (!stripe || !admin || !priceId) {
      throw new ApiRouteError('L’activation de l’essai n’est pas configurée.', 503);
    }

    // Never reset an existing trial, including one that has already expired.
    const existing = await admin.from('subscriptions').select(accessColumns)
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return jsonResponse(request, { subscription: existing.data });

    // Recover Stripe state after a failed database write rather than creating another trial.
    const previous: Stripe.Subscription[] = [];
    for await (const customer of stripe.customers.list({ email: user.email, limit: 100 })) {
      if (customer.metadata.user_id !== user.id) continue;
      for await (const subscription of stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 })) {
        previous.push(subscription);
      }
    }
    previous.sort((a, b) => {
      const rank = (value: Stripe.Subscription) => value.status === 'active' ? 2 : value.status === 'trialing' ? 1 : 0;
      return rank(b) - rank(a) || b.created - a.created;
    });
    let subscription = previous[0];
    if (!subscription) {
      const configuredPrice = await stripe.prices.retrieve(priceId);
      if (!configuredPrice.active || configuredPrice.unit_amount !== 199 || configuredPrice.currency !== 'eur'
        || configuredPrice.recurring?.interval !== 'month' || configuredPrice.recurring.interval_count !== 1) {
        throw new ApiRouteError('L’activation de l’essai est temporairement indisponible. Contacte le support.', 503);
      }
      // A dedicated new customer has no stored card. Stable idempotency keys also cover concurrent requests.
      const customer = await stripe.customers.create({
        email: user.email,
        name: String(user.user_metadata?.name ?? '').trim() || undefined,
        metadata: { user_id: user.id },
      }, { idempotencyKey: `kloo-trial-customer-${user.id}` });
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        trial_period_days: 7,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: { user_id: user.id, email: user.email ?? '', trial_days: '7', cardless_trial: 'true' },
      }, { idempotencyKey: `kloo-free-trial-${user.id}` });
    }

    const price = subscription.items.data[0]?.price;
    const periodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end
      ?? subscription.items.data[0]?.current_period_end;
    const saved = await admin.from('subscriptions').upsert({
      user_id: user.id,
      provider: 'stripe',
      provider_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
      provider_subscription_id: subscription.id,
      status: subscription.status === 'unpaid' ? 'past_due' : ['paused','incomplete_expired'].includes(subscription.status) ? 'incomplete' : subscription.status,
      price_amount: (price?.unit_amount ?? 199) / 100,
      currency: (subscription.currency ?? 'eur').toUpperCase(),
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      current_period_end_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    }, { onConflict: 'provider_subscription_id' }).select(accessColumns).maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw new ApiRouteError('Ton essai n’a pas pu être enregistré. Réessaie.', 503);
    return jsonResponse(request, { subscription: saved.data });
  } catch (error) {
    return jsonResponse(request, {
      error: error instanceof Error ? error.message : 'Activation de l’essai indisponible.',
    }, { status: error instanceof ApiRouteError ? error.status : 500 });
  }
}
