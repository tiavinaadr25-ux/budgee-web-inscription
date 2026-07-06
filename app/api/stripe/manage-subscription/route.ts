import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import {
  ApiRouteError,
  assertAuthenticatedUser,
  ensureAllowedOrigin,
  jsonResponse,
  optionsResponse,
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

export const runtime = 'nodejs';

type ManageAction = 'cancel' | 'resume';

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

function normalizeAction(value: string): ManageAction {
  if (value === 'resume') {
    return 'resume';
  }

  return 'cancel';
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
    throw new Error('Compte Kloo introuvable.');
  }

  const normalizedProfileEmail = data.email?.trim().toLowerCase() ?? '';
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail && normalizedProfileEmail && normalizedEmail !== normalizedProfileEmail) {
    throw new Error('Compte Kloo invalide.');
  }

  return {
    userId: data.id,
    email: normalizedProfileEmail || normalizedEmail,
  };
}

async function findLatestSubscriptionId(userId: string, email: string) {
  if (!stripe || !admin) {
    throw new Error('Stripe ou Supabase n’est pas configuré.');
  }

  const { data: storedSubscription, error: storedSubscriptionError } = await admin
    .from('subscriptions')
    .select('provider_subscription_id')
    .eq('user_id', userId)
    .not('provider_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (storedSubscriptionError) {
    throw storedSubscriptionError;
  }

  if (storedSubscription?.provider_subscription_id) {
    return storedSubscription.provider_subscription_id as string;
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

async function syncSubscriptionRecord(
  userId: string,
  subscription: Stripe.Subscription & {
    current_period_end: number | null;
    trial_end: number | null;
  },
) {
  if (!admin) {
    throw new Error('Supabase admin n’est pas configuré.');
  }

  const unitAmount = subscription.items.data[0]?.price.unit_amount;
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
        price_amount: typeof unitAmount === 'number' ? unitAmount / 100 : 1.99,
        currency: (subscription.currency ?? 'eur').toUpperCase(),
        trial_ends_at: fromUnix(subscription.trial_end),
        current_period_end_at: fromUnix(subscription.current_period_end),
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      },
      { onConflict: 'provider_subscription_id' },
    )
    .select(
      'id, provider, status, price_amount, currency, trial_ends_at, current_period_end_at, cancel_at_period_end',
    )
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return result.data ?? null;
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  if (!stripe || !admin) {
    return jsonResponse(
      request,
      { error: 'Gestion de l’abonnement Stripe non configurée.' },
      { status: 500 },
    );
  }

  try {
    ensureAllowedOrigin(request);
    const authenticatedUser = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const rawUserId = String(payload.userId ?? '').trim();
    const action = normalizeAction(String(payload.action ?? 'cancel').trim().toLowerCase());

    if (!rawUserId) {
      return jsonResponse(request, { error: 'Compte Kloo manquant.' }, { status: 400 });
    }

    assertAuthenticatedUser(authenticatedUser, rawUserId);
    const user = await verifyProfileUser(
      authenticatedUser.id,
      authenticatedUser.email?.trim().toLowerCase() ?? '',
    );
    const subscriptionId = await findLatestSubscriptionId(user.userId, user.email);

    if (!subscriptionId) {
      return jsonResponse(
        request,
        { error: 'Aucun abonnement Stripe actif à gérer pour ce compte.' },
        { status: 404 },
      );
    }

    let subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Stripe.Subscription & {
      current_period_end: number | null;
      trial_end: number | null;
    };

    if (action === 'cancel') {
      if (subscription.status === 'canceled') {
        return jsonResponse(request, {
          ok: true,
          subscription: await syncSubscriptionRecord(user.userId, subscription),
        });
      }

      if (
        !['trialing', 'active', 'past_due', 'unpaid'].includes(subscription.status)
      ) {
        throw new ApiRouteError('Cet abonnement ne peut pas être résilié pour le moment.', 400);
      }

      if (!subscription.cancel_at_period_end) {
        subscription = (await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: true,
        })) as unknown as Stripe.Subscription & {
          current_period_end: number | null;
          trial_end: number | null;
        };
      }
    } else {
      if (subscription.status === 'canceled') {
        throw new ApiRouteError('Cet abonnement est déjà terminé et ne peut plus être réactivé.', 400);
      }

      if (
        !['trialing', 'active', 'past_due', 'unpaid'].includes(subscription.status)
      ) {
        throw new ApiRouteError('Cet abonnement ne peut pas être réactivé pour le moment.', 400);
      }

      if (subscription.cancel_at_period_end) {
        subscription = (await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: false,
        })) as unknown as Stripe.Subscription & {
          current_period_end: number | null;
          trial_end: number | null;
        };
      }
    }

    const syncedSubscription = await syncSubscriptionRecord(user.userId, subscription);

    return jsonResponse(request, {
      ok: true,
      subscription: syncedSubscription,
    });
  } catch (error) {
    const status = error instanceof ApiRouteError ? error.status : 500;
    return jsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : 'Gestion de l’abonnement indisponible pour le moment.',
      },
      { status },
    );
  }
}
