import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { ApiRouteError, ensureAllowedOrigin, requireAuthenticatedUser, jsonResponse, optionsResponse } from '../_lib/security';
import { applyCardUpdate } from '../_lib/update-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const renewable = ['trialing', 'active', 'past_due', 'unpaid'];
const unix = (n: number | null | undefined) => n ? new Date(n * 1000).toISOString() : null;

async function context(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  const key = process.env.STRIPE_SECRET_KEY;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !url || !serviceKey) throw new ApiRouteError('La gestion du paiement est temporairement indisponible.', 503);
  const stripe = new Stripe(key);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = await admin.from('subscriptions')
    .select('provider, provider_subscription_id, status, current_period_end_at, trial_ends_at, cancel_at_period_end')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (rows.error) throw new ApiRouteError('Impossible de vérifier ton abonnement.', 503);
  if (rows.data?.length === 100) throw new ApiRouteError('Contacte le support pour vérifier tes abonnements.', 409);
  // Only use subscription identifiers tied to the authenticated account in our ledger.
  const subscriptions: Stripe.Subscription[] = [];
  const ids = new Set<string>();
  for (const row of rows.data ?? []) {
    if (row.provider !== 'stripe' || !row.provider_subscription_id || ids.has(row.provider_subscription_id)) continue;
    ids.add(row.provider_subscription_id);
    const subscription = await stripe.subscriptions.retrieve(row.provider_subscription_id);
    if (subscription.metadata.user_id && subscription.metadata.user_id !== user.id)
      throw new ApiRouteError('Cet abonnement ne correspond pas à ton compte.', 403);
    subscriptions.push(subscription);
  }
  return { user, stripe, admin, rows: rows.data ?? [], subscriptions };
}

function failure(request: NextRequest, error: unknown) {
  return jsonResponse(request, { error: error instanceof ApiRouteError ? error.message : 'La gestion du paiement est temporairement indisponible. Réessaie ou contacte le support.' },
    { status: error instanceof ApiRouteError ? error.status : 503 });
}
export function OPTIONS(request: NextRequest) { return optionsResponse(request); }
export async function GET(request: NextRequest) {
  try {
    const c = await context(request);
    const current = c.subscriptions.filter(s => renewable.includes(s.status));
    const ends = current.map(s => s.status === 'trialing' ? s.trial_end : s.items.data[0]?.current_period_end).filter((n): n is number => Boolean(n));
    return jsonResponse(request, {
      canUpdateCard: current.some(s => s.status !== 'trialing'),
      cardRenews: current.some(s => s.status !== 'trialing' && !s.cancel_at_period_end),
      cardEndsAt: ends.length ? unix(Math.max(...ends)) : null,
      access: c.rows[0] ?? null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(request, error); }
}
export async function POST(request: NextRequest) {
  try {
    ensureAllowedOrigin(request);
    const user = await requireAuthenticatedUser(request);
    const { action } = await request.json();
    if (!['portal', 'confirm-card', 'switch-mobile'].includes(action)) throw new ApiRouteError('Action invalide.', 400);
    const c = await context(request);
    if (c.user.id !== user.id) throw new ApiRouteError('Compte invalide.', 403);
    const current = c.subscriptions.filter(s => renewable.includes(s.status));
    if (action === 'portal') {
      const subscription = current.find(s => s.status !== 'trialing');
      if (!subscription) throw new ApiRouteError('Aucun abonnement carte à modifier. Choisis ton paiement à la fin de ton accès.', 409);
      const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const site = new URL(process.env.SITE_URL || '');
      if (site.protocol !== 'https:') throw new ApiRouteError('Adresse du site non configurée.', 503);
      // Setup mode collects a replacement card without creating a new subscription or charge.
      const session = await c.stripe.checkout.sessions.create({ customer, mode: 'setup', payment_method_types: ['card'],
        metadata: { user_id: c.user.id, purpose: 'kloo-card-update' },
        success_url: `${site.origin}/paiement/gestion?card=return&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site.origin}/paiement/gestion?card=cancel`, locale: 'fr' });
      return jsonResponse(request, { url: session.url });
    }
    if (action === 'confirm-card') {
      // The session is read from Stripe; no client-supplied payment-method identifier is trusted.
      const sessionId = request.nextUrl.searchParams.get('session_id');
      if (!sessionId || !sessionId.startsWith('cs_')) throw new ApiRouteError('Session carte manquante.', 400);
      const session = await c.stripe.checkout.sessions.retrieve(sessionId);
      await applyCardUpdate(c.stripe, c.admin, session, c.user.id);
      return jsonResponse(request, { ok: true });
    }
    // Cancel every renewable card subscription for this account; never charge here.
    const ends: number[] = [];
    for (const original of current) {
      const s = original.cancel_at_period_end ? original : await c.stripe.subscriptions.update(original.id, { cancel_at_period_end: true });
      const end = s.status === 'trialing' ? s.trial_end : s.items.data[0]?.current_period_end;
      if (end) ends.push(end);
      const saved = await c.admin.from('subscriptions').update({ cancel_at_period_end: true,
        current_period_end_at: unix(s.items.data[0]?.current_period_end), trial_ends_at: unix(s.trial_end) })
        .eq('user_id', c.user.id).eq('provider', 'stripe').eq('provider_subscription_id', s.id);
      if (saved.error) throw new ApiRouteError('Le renouvellement a été arrêté chez Stripe, mais la synchronisation doit être reprise. Actualise cette page.', 503);
    }
    return jsonResponse(request, { ok: true, cardEndsAt: ends.length ? unix(Math.max(...ends)) : null });
  } catch (error) { return failure(request, error); }
}
