import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function fromUnix(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function normalizeSubscriptionStatus(status) {
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

function normalizeBillingStatus(status) {
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
      return data.user_id;
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
      return data.user_id;
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

    return data?.id ?? null;
  }

  return null;
}

async function upsertPaymentMethod(userId, paymentMethod) {
  if (!admin || !paymentMethod || typeof paymentMethod === 'string' || paymentMethod.type !== 'card') {
    return;
  }

  const result = await admin.from('payment_methods').upsert(
    {
      user_id: userId,
      provider: 'stripe',
      provider_payment_method_id: paymentMethod.id,
      brand: paymentMethod.card.brand || 'Carte',
      last4: paymentMethod.card.last4,
      exp_month: paymentMethod.card.exp_month,
      exp_year: paymentMethod.card.exp_year,
      is_primary: true,
    },
    { onConflict: 'provider_payment_method_id' },
  );

  if (result.error) {
    throw result.error;
  }
}

async function syncSubscriptionRecord({ userId, subscriptionId, customerId }) {
  if (!stripe || !admin || !userId || !subscriptionId) {
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method'],
  });

  const result = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        provider: 'stripe',
        provider_customer_id: typeof subscription.customer === 'string' ? subscription.customer : customerId,
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

  return result.data?.id ?? null;
}

async function syncBillingRecord(invoice, fallbackUserId = null) {
  if (!admin) {
    throw new Error('Supabase admin n’est pas configuré.');
  }

  const invoiceEmail =
    invoice.customer_email ??
    invoice.customer_details?.email ??
    null;
  const invoiceSubscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null;
  const invoiceCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await getUserIdFromStripeReferences({
    userId: fallbackUserId,
    customerId: invoiceCustomerId,
    subscriptionId: invoiceSubscriptionId,
    email: invoiceEmail,
  });

  if (!userId) {
    return;
  }

  let subscriptionRowId = null;

  if (invoiceSubscriptionId) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id')
      .eq('provider_subscription_id', invoiceSubscriptionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    subscriptionRowId = data?.id ?? null;
  }

  const billingResult = await admin.from('billing_records').upsert(
    {
      user_id: userId,
      subscription_id: subscriptionRowId,
      provider_invoice_id: invoice.id,
      label: 'Abonnement Budgee',
      amount: Number(((invoice.amount_paid || invoice.amount_due || 0) / 100).toFixed(2)),
      currency: (invoice.currency ?? 'eur').toUpperCase(),
      billed_at: fromUnix(invoice.status_transitions?.paid_at ?? invoice.created) ?? new Date().toISOString(),
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

export const handler = async (event) => {
  if (!stripe || !stripeWebhookSecret || !admin) {
    return response(500, { error: 'Webhook Stripe non configuré.' });
  }

  try {
    const signature = event.headers['stripe-signature'];
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : event.body ?? '';

    const stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        if (session.mode !== 'subscription') {
          break;
        }

        const userId = await getUserIdFromStripeReferences({
          userId: session.metadata?.user_id ?? session.client_reference_id ?? null,
          customerId: typeof session.customer === 'string' ? session.customer : null,
          subscriptionId:
            typeof session.subscription === 'string' ? session.subscription : null,
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
        const subscription = stripeEvent.data.object;
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
        const invoice = stripeEvent.data.object;
        const userId = await getUserIdFromStripeReferences({
          userId: null,
          customerId: typeof invoice.customer === 'string' ? invoice.customer : null,
          subscriptionId:
            typeof invoice.subscription === 'string' ? invoice.subscription : null,
          email: invoice.customer_email ?? invoice.customer_details?.email ?? null,
        });

        if (
          userId &&
          typeof invoice.subscription === 'string' &&
          stripeEvent.type === 'invoice.paid'
        ) {
          await syncSubscriptionRecord({
            userId,
            subscriptionId: invoice.subscription,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : null,
          });
        }

        await syncBillingRecord(invoice, userId);
        break;
      }

      default:
        break;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    return response(400, {
      error: error instanceof Error ? error.message : 'Webhook Stripe invalide.',
    });
  }
};
