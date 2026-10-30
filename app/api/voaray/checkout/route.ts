import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { ApiRouteError, ensureAllowedOrigin, jsonResponse, optionsResponse, requireAuthenticatedUser } from '../../_lib/security';
import { accessIsActive, initiateVoarayPayment, voarayAdmin, voarayConfig } from '../../_lib/voaray';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = voarayConfig();
  const missing = ['VOARAY_API_KEY', 'VOARAY_MERCHANT_KEY', 'VOARAY_API_SECRET', 'VOARAY_WEBHOOK_SECRET', 'SITE_URL', 'VOARAY_PRICE_AMOUNT']
    .filter(name => !process.env[name]?.trim());
  const invalid = [
    ...(!['sandbox', 'production'].includes(config.environment) ? ['VOARAY_ENVIRONMENT'] : []),
    ...(!Number.isFinite(config.amount) || config.amount < 1 || Math.round(config.amount * 100) !== config.amount * 100 ? ['VOARAY_PRICE_AMOUNT'] : []),
    ...(!/^[A-Z]{3}$/.test(config.currency) ? ['VOARAY_CURRENCY'] : []),
    ...(!config.ready && missing.length === 0 && !/^https:\/\/(?!localhost(?=[:/]|$)|127\.0\.0\.1(?=[:/]|$)|\[::1\])[^/]+/i.test(config.siteUrl ?? '') ? ['SITE_URL'] : []),
  ];
  let storageReady = false;
  if (config.ready) {
    try { storageReady = !(await voarayAdmin().from('voaray_orders').select('provider_trx_id,next_verification_at').limit(0)).error; } catch {}
  }
  return jsonResponse(request, { available: config.ready && storageReady,
    amount: Number.isFinite(config.amount) ? config.amount : null,
    currency: config.currency, sandbox: config.environment === 'sandbox', configuration: { missing, invalid, storageReady } },
    { headers: { 'Cache-Control': 'no-store' } });
}
export function OPTIONS(request: NextRequest) { return optionsResponse(request); }
export async function POST(request: NextRequest) {
  try {
    ensureAllowedOrigin(request);
    const user = await requireAuthenticatedUser(request);
    if (!user.email_confirmed_at) throw new ApiRouteError('Confirme ton email pour continuer.', 403);
    const config = voarayConfig();
    if (!config.ready) throw new ApiRouteError('Le paiement Mobile Money n’est pas encore disponible.', 503);
    const admin = voarayAdmin();
    const storage = await admin.from('voaray_orders').select('provider_trx_id,next_verification_at').limit(0);
    if (storage.error) throw new ApiRouteError('Le paiement Mobile Money est temporairement indisponible. Aucun paiement n’a été ouvert.', 503);
    const current = await admin.from('subscriptions').select('id, status, trial_ends_at, current_period_end_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (current.error) throw new ApiRouteError('Impossible de vérifier ton accès.', 503);
    if (!current.data || accessIsActive(current.data)) throw new ApiRouteError('Le paiement est disponible après la fin de ton essai ou de ton accès actuel.', 409);
    // One order per account/access period/environment, shared across repeated clicks and retries.
    const purchaseKey = `${config.environment}:${user.id}:${current.data.id}`;
    const inserted = await admin.from('voaray_orders').insert({ id: randomUUID(), user_id: user.id,
      purchase_key: purchaseKey, amount: config.amount, currency: config.currency,
      environment: config.environment }).select('*').single();
    let order = inserted.data;
    if (inserted.error?.code === '23505') {
      const previous = await admin.from('voaray_orders').select('*').eq('purchase_key', purchaseKey).eq('status','pending').single();
      if (previous.error) throw new ApiRouteError('Impossible de retrouver ton paiement.', 503);
      order = previous.data;
    } else if (inserted.error) throw new ApiRouteError('Le paiement Mobile Money n’est pas encore prêt. Contacte le support.', 503);
    if (!order) throw new ApiRouteError('Paiement indisponible.', 503);
    if (['completed', 'refunded', 'sandbox_completed'].includes(order.status)) throw new ApiRouteError('Ce paiement a déjà été traité. Actualise ton accès ou contacte le support.', 409);
    const site = new URL(config.siteUrl!).origin;
    if (!site.startsWith('https://')) throw new ApiRouteError('Le paiement nécessite l’adresse publique HTTPS du site.', 503);
    const payload: Record<string, unknown> = { payment_amount: Number(order.amount), currency_code: order.currency,
      ref_trx: order.id, description: 'Kloo — un mois d’accès, sans renouvellement automatique',
      success_redirect: `${site}/paiement?voaray=return&order=${order.id}`,
      cancel_redirect: `${site}/paiement?voaray=cancel&order=${order.id}`,
      ipn_url: `${site}/api/voaray/webhook` };
    const methods = process.env.VOARAY_PAYMENT_METHODS?.trim();
    if (methods) payload.allow_payment_methods = methods;
    const payment = await initiateVoarayPayment(payload);
    const saved = await admin.from('voaray_orders').update({ provider_trx_id: payment.transactionId })
      .eq('id', order.id).eq('user_id', user.id)
      .or(`provider_trx_id.is.null,provider_trx_id.eq.${payment.transactionId}`).select('id').single();
    if (saved.error || !saved.data) throw new ApiRouteError('Impossible d’enregistrer la référence Voaray. Aucun paiement n’a été ouvert.', 503);
    return jsonResponse(request, { url: payment.url, orderId: order.id });
  } catch (error) {
    return jsonResponse(request, { error: error instanceof ApiRouteError ? error.message : 'Le paiement Mobile Money est temporairement indisponible.' },
      { status: error instanceof ApiRouteError ? error.status : 500 });
  }
}
