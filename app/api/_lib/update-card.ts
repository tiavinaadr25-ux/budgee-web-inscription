import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiRouteError } from './security';

// Shared by the authenticated return route and Stripe's signed webhook.
export async function applyCardUpdate(stripe: Stripe, admin: SupabaseClient, session: Stripe.Checkout.Session, userId: string) {
  if (session.mode !== 'setup' || session.metadata?.purpose !== 'kloo-card-update' || session.metadata?.user_id !== userId)
    throw new ApiRouteError('Cette modification de carte ne correspond pas à ton compte.', 403);
  if (session.status !== 'complete') throw new ApiRouteError('La modification de carte n’est pas terminée.', 409);
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const intentId = typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent?.id;
  if (!customerId || !intentId) throw new ApiRouteError('Modification de carte incomplète.', 409);
  const intent = await stripe.setupIntents.retrieve(intentId);
  const intentCustomer = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id;
  const paymentMethod = typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id;
  if (intent.status !== 'succeeded' || intentCustomer !== customerId || !paymentMethod)
    throw new ApiRouteError('La nouvelle carte n’a pas encore été validée.', 409);
  const rows = await admin.from('subscriptions').select('provider_subscription_id')
    .eq('user_id', userId).eq('provider', 'stripe').eq('provider_customer_id', customerId);
  if (rows.error || !rows.data?.length) throw new ApiRouteError('Abonnement carte introuvable.', 409);
  for (const row of rows.data) {
    const s = await stripe.subscriptions.retrieve(row.provider_subscription_id);
    if ((typeof s.customer === 'string' ? s.customer : s.customer.id) !== customerId || (s.metadata.user_id && s.metadata.user_id !== userId))
      throw new ApiRouteError('Abonnement invalide.', 403);
    if (['trialing', 'active', 'past_due', 'unpaid'].includes(s.status)) {
      await stripe.subscriptions.update(s.id, { default_payment_method: paymentMethod });
    }
  }
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethod } });
}
