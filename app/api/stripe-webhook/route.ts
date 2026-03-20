// MIGRATED FROM: netlify/functions/stripe-webhook.mjs
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

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

function normalizeBillingStatus(status: string) {
  switch (status) {
    case 'paid':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'failed':
      return 'failed';
    default:
      return 'upcoming';
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

  // DECISION: on garde strictement la logique historique du webhook Budgee.
  // Le SDK Stripe installé tape plus strictement certains champs, donc on caste
  // localement la réponse pour conserver les accès déjà utilisés dans la fonction Netlify.
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
    .select('id')
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  await upsertPaymentMethod(userId, subscription.default_payment_method);

  return (result.data?.id as string | undefined) ?? null;
}

async function syncBillingRecord(invoice: Stripe.Invoice, fallbackUserId: string | null = null) {
  if (!admin) {
    throw new Error('Supabase admin n’est pas configuré.');
  }

  const invoiceDetails = invoice as Stripe.Invoice & {
    customer_details?: {
      email?: string | null;
    };
    subscription?: string | { id?: string | null } | null;
    customer?: string | { id?: string | null } | null;
  };
  const invoiceEmail = invoice.customer_email ?? invoiceDetails.customer_details?.email ?? null;
  const invoiceSubscriptionId =
    typeof invoiceDetails.subscription === 'string'
      ? invoiceDetails.subscription
      : invoiceDetails.subscription?.id ?? null;
  const invoiceCustomerId =
    typeof invoiceDetails.customer === 'string'
      ? invoiceDetails.customer
      : invoiceDetails.customer?.id ?? null;
  const userId = await getUserIdFromStripeReferences({
    userId: fallbackUserId,
    customerId: invoiceCustomerId,
    subscriptionId: invoiceSubscriptionId,
    email: invoiceEmail,
  });

  if (!userId) {
    return;
  }

  let subscriptionRowId: string | null = null;

  if (invoiceSubscriptionId) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id')
      .eq('provider_subscription_id', invoiceSubscriptionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    subscriptionRowId = (data?.id as string | undefined) ?? null;
  }

  const paidAt =
    typeof invoice.status_transitions?.paid_at === 'number'
      ? invoice.status_transitions.paid_at
      : invoice.created;
  const billingResult = await admin.from('billing_records').upsert(
    {
      user_id: userId,
      subscription_id: subscriptionRowId,
      provider_invoice_id: invoice.id,
      label: 'Abonnement Budgee',
      amount: Number((((invoice.amount_paid ?? invoice.amount_due) || 0) / 100).toFixed(2)),
      currency: (invoice.currency ?? 'eur').toUpperCase(),
      billed_at: fromUnix(paidAt) ?? new Date().toISOString(),
      status: normalizeBillingStatus(
        invoice.status === 'paid'
          ? 'paid'
          : invoice.status === 'open' && invoice.amount_remaining > 0
            ? 'failed'
            : 'upcoming',
      ),
    },
    { onConflict: 'provider_invoice_id' },
  );

  if (billingResult.error) {
    throw billingResult.error;
  }
}

// DECISION: le SDK Stripe côté serveur Next a besoin du runtime Node.js, pas Edge.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!stripe || !stripeWebhookSecret || !admin) {
    return NextResponse.json({ error: 'Webhook Stripe non configuré.' }, { status: 500 });
  }

  try {
    const signature = request.headers.get('stripe-signature');
    const rawBody = await request.text();

    if (!signature) {
      return NextResponse.json({ error: 'Signature Stripe manquante.' }, { status: 400 });
    }

    const stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') {
          break;
        }

        const userId = await getUserIdFromStripeReferences({
          userId: session.metadata?.user_id ?? session.client_reference_id ?? null,
          customerId: typeof session.customer === 'string' ? session.customer : null,
          subscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
          email: session.customer_details?.email ?? session.customer_email ?? null,
        });

        if (userId && typeof session.subscription === 'string') {
          await syncSubscriptionRecord({
            userId,
            subscriptionId: session.subscription,
            customerId: typeof session.customer === 'string' ? session.customer : null,
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const userId = await getUserIdFromStripeReferences({
          userId: subscription.metadata?.user_id ?? null,
          customerId: typeof subscription.customer === 'string' ? subscription.customer : null,
          subscriptionId: subscription.id,
          email: null,
        });

        if (userId) {
          await syncSubscriptionRecord({
            userId,
            subscriptionId: subscription.id,
            customerId: typeof subscription.customer === 'string' ? subscription.customer : null,
          });
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const invoiceDetails = invoice as Stripe.Invoice & {
          customer_details?: { email?: string | null };
          subscription?: string | { id?: string | null } | null;
        };
        const userId = await getUserIdFromStripeReferences({
          userId: null,
          customerId: typeof invoice.customer === 'string' ? invoice.customer : null,
          subscriptionId:
            typeof invoiceDetails.subscription === 'string'
              ? invoiceDetails.subscription
              : null,
          email: invoice.customer_email ?? invoiceDetails.customer_details?.email ?? null,
        });

        if (
          userId &&
          typeof invoiceDetails.subscription === 'string' &&
          stripeEvent.type === 'invoice.paid'
        ) {
          await syncSubscriptionRecord({
            userId,
            subscriptionId: invoiceDetails.subscription,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : null,
          });
        }

        await syncBillingRecord(invoice, userId);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Webhook Stripe invalide.',
      },
      { status: 400 },
    );
  }
}
