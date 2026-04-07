import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

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
    case 'unpaid':
      return status;
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
    current_period_end: number | null;
    trial_end: number | null;
  };

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
        price_amount: 3.49,
        currency: (subscription.currency ?? 'eur').toUpperCase(),
        trial_ends_at: fromUnix(subscription.trial_end),
        current_period_end_at: fromUnix(subscription.current_period_end),
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

  return result.data ?? null;
}

export async function POST(request: NextRequest) {
  if (!stripe || !admin) {
    return NextResponse.json(
      { error: 'Confirmation Stripe non configurée.' },
      { status: 500 },
    );
  }

  try {
    const payload = await request.json();
    const sessionId = String(payload.sessionId ?? '').trim();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session Stripe manquante.' },
        { status: 400 },
      );
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.mode !== 'subscription') {
      return NextResponse.json(
        { error: 'Cette session Stripe n’est pas un abonnement.' },
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
      return NextResponse.json(
        { error: 'Impossible de relier cette session Stripe à un compte Budgee.' },
        { status: 400 },
      );
    }

    const subscription = await syncSubscriptionRecord({
      userId,
      subscriptionId: checkoutSession.subscription,
      customerId: typeof checkoutSession.customer === 'string' ? checkoutSession.customer : null,
    });

    return NextResponse.json({
      ok: true,
      subscription,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Confirmation Stripe indisponible.',
      },
      { status: 500 },
    );
  }
}
