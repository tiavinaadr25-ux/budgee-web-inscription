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

async function verifyProfileUser(userId: string, email: string) {
  if (!admin) {
    throw new Error('Supabase admin n’est pas configuré.');
  }

  const { data, error } = await admin
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error('Compte Budgee introuvable.');
  }

  const normalizedProfileEmail = data.email?.trim().toLowerCase() ?? '';
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail && normalizedProfileEmail && normalizedEmail !== normalizedProfileEmail) {
    throw new Error('Compte Budgee invalide.');
  }

  return {
    userId: data.id,
    email: normalizedProfileEmail || normalizedEmail,
  };
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

async function syncSubscriptionRecord(userId: string, subscriptionId: string) {
  if (!stripe || !admin) {
    throw new Error('Stripe ou Supabase n’est pas configuré.');
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
          typeof subscription.customer === 'string' ? subscription.customer : null,
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
    .select('id, status, trial_ends_at, current_period_end_at, cancel_at_period_end')
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  await upsertPaymentMethod(userId, subscription.default_payment_method);

  return result.data ?? null;
}

async function findLatestSubscriptionId(userId: string, email: string) {
  if (!stripe) {
    throw new Error('Stripe n’est pas configuré.');
  }

  const customers = email
    ? await stripe.customers.list({
        email,
        limit: 10,
      })
    : { data: [] as Stripe.Customer[] };

  const prioritizedCustomers = customers.data
    .filter((customer): customer is Stripe.Customer => !customer.deleted)
    .sort((left, right) => {
      const leftScore = left.metadata?.user_id === userId ? 1 : 0;
      const rightScore = right.metadata?.user_id === userId ? 1 : 0;
      return rightScore - leftScore;
    });

  for (const customer of prioritizedCustomers) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    const candidate = subscriptions.data.find((subscription) =>
      ['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid'].includes(
        subscription.status,
      ),
    );

    if (candidate) {
      return candidate.id;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!stripe || !admin) {
    return NextResponse.json({ error: 'Sync Stripe non configuré.' }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const rawUserId = String(payload.userId ?? '').trim();
    const rawEmail = String(payload.email ?? '').trim().toLowerCase();

    if (!rawUserId) {
      return NextResponse.json(
        { error: 'Compte Budgee manquant.' },
        { status: 400 },
      );
    }

    const user = await verifyProfileUser(rawUserId, rawEmail);
    const subscriptionId = await findLatestSubscriptionId(user.userId, user.email);

    if (!subscriptionId) {
      return NextResponse.json({ ok: true, subscription: null });
    }

    const subscription = await syncSubscriptionRecord(user.userId, subscriptionId);
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Synchronisation Stripe indisponible.',
      },
      { status: 500 },
    );
  }
}
