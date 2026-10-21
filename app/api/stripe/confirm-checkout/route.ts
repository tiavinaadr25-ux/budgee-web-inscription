import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  ApiRouteError,
  ensureAllowedOrigin,
  jsonResponse,
  requireAuthenticatedUser,
} from '../../_lib/security';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// DECISION: cette route sert de filet de securite si le webhook Stripe n'a pas encore
// synchronise la base au moment du retour utilisateur depuis Checkout.
export const runtime = 'nodejs';

function fromUnix(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function normalizeSubscriptionStatus(status: string) {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return status;
    case 'unpaid':
      return 'past_due';
    default:
      return 'incomplete';
  }
}

async function getUserIdFromStripeReferences({
  userId,
  customerId,
  subscriptionId,
  email,
}: {
  userId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  email: string | null;
}) {
  if (!admin) {
    throw new Error('Supabase admin n’est pas configuré.');
  }

  if (userId) {
    return userId;
  }

  if (subscriptionId) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('provider_subscription_id', subscriptionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.user_id) {
      return data.user_id as string;
    }
  }

  if (customerId) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('provider_customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.user_id) {
      return data.user_id as string;
    }
  }

  if (email) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data?.id as string | undefined) ?? null;
  }

  return null;
}

async function upsertPaymentMethod(
  userId: string,
  paymentMethod: Stripe.PaymentMethod | string | null | undefined,
) {
  if (!admin || !paymentMethod || typeof paymentMethod === 'string' || paymentMethod.type !== 'card') {
    return;
  }

  const card = paymentMethod.card;
  if (!card) {
    return;
  }

  const result = await admin.from('payment_methods').upsert(
    {
      user_id: userId,
      provider: 'stripe',
      provider_payment_method_id: paymentMethod.id,
      brand: card.brand || 'Carte',
      last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      is_primary: true,
    },
    { onConflict: 'provider_payment_method_id' },
  );

  if (result.error) {
    throw result.error;
  }
}

async function syncSubscriptionRecord({
  userId,
  subscriptionId,
  customerId,
}: {
  userId: string;
  subscriptionId: string;
  customerId: string | null;
}) {
  if (!stripe || !admin || !userId || !subscriptionId) {
    return null;
  }

  const subscription = (await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method'],
  })) as unknown as Stripe.Subscription & {
    current_period_start: number;
    current_period_end: number;
    trial_end: number | null;
  };

  if (!['active', 'trialing'].includes(subscription.status)) {
    throw new ApiRouteError('Ton paiement n’est pas encore confirmé. Réessaie dans un instant.', 409);
  }

  const result = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        provider: 'stripe',
        provider_customer_id:
          typeof subscription.customer === 'string' ? subscription.customer : customerId,
        provider_subscription_id: subscription.id,
        status: normalizeSubscriptionStatus(subscription.status),
        price_amount: (subscription.items.data[0]?.price.unit_amount ?? 199) / 100,
        currency: (subscription.currency ?? 'eur').toUpperCase(),
        trial_ends_at: fromUnix(subscription.trial_end),
        current_period_end_at: fromUnix(subscription.current_period_end ?? subscription.items.data[0]?.current_period_end),
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      },
      { onConflict: 'provider_subscription_id' },
    )
    .select('id, status, trial_ends_at, current_period_end_at')
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  await upsertPaymentMethod(userId, subscription.default_payment_method);

  const invoiceId = typeof subscription.latest_invoice === 'string'
    ? subscription.latest_invoice : subscription.latest_invoice?.id;
  if (invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    const billing = await admin.from('billing_records').upsert({
      user_id: userId,
      subscription_id: result.data?.id ?? null,
      provider_invoice_id: invoice.id,
      label: 'Abonnement Kloo',
      amount: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
      currency: (invoice.currency ?? 'eur').toUpperCase(),
      status: invoice.status === 'paid' ? 'paid' : invoice.status === 'open' || invoice.status === 'draft' ? 'pending' : 'failed',
      billed_at: fromUnix(invoice.status_transitions?.paid_at ?? invoice.created),
    }, { onConflict: 'provider_invoice_id' });
    if (billing.error) throw billing.error;
  }

  return result.data ?? null;
}

export async function POST(request: NextRequest) {
  if (!stripe || !admin) {
    return jsonResponse(
      request,
      { error: 'Confirmation du paiement non configurée.' },
      { status: 500 },
    );
  }

  try {
    ensureAllowedOrigin(request);
    const authenticatedUser = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const sessionId = String(payload.sessionId ?? '').trim();

    if (!sessionId) {
      return jsonResponse(
        request,
        { error: 'Session de paiement manquante.' },
        { status: 400 },
      );
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.mode !== 'subscription') {
      return jsonResponse(
        request,
        { error: 'Cette session de paiement n’est pas un abonnement.' },
        { status: 400 },
      );
    }

    const userId = await getUserIdFromStripeReferences({
      userId: checkoutSession.metadata?.user_id ?? checkoutSession.client_reference_id ?? null,
      customerId: typeof checkoutSession.customer === 'string' ? checkoutSession.customer : null,
      subscriptionId:
        typeof checkoutSession.subscription === 'string' ? checkoutSession.subscription : null,
      email: checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? null,
    });

    if (!userId || typeof checkoutSession.subscription !== 'string') {
      return jsonResponse(
        request,
        { error: 'Impossible de relier cette session de paiement à un compte Kloo.' },
        { status: 400 },
      );
    }

    if (authenticatedUser.id !== userId) {
      throw new ApiRouteError('Compte Kloo invalide.', 403);
    }

    if (checkoutSession.status !== 'complete' || !['paid', 'no_payment_required'].includes(checkoutSession.payment_status)) {
      throw new ApiRouteError('Le paiement n’est pas encore confirmé. Réessaie dans un instant.', 409);
    }

    const subscription = await syncSubscriptionRecord({
      userId,
      subscriptionId: checkoutSession.subscription,
      customerId: typeof checkoutSession.customer === 'string' ? checkoutSession.customer : null,
    });

    return jsonResponse(request, {
      ok: true,
      subscription,
    });
  } catch (error) {
    const status = error instanceof ApiRouteError ? error.status : 500;
    return jsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : 'Confirmation du paiement indisponible.',
      },
      { status },
    );
  }
}
