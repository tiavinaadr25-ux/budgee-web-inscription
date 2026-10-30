import { ApiRouteError } from './api-error';
import { signature, voarayAdmin, voarayConfig } from './voaray';

type Order = { id: string; user_id: string; provider_trx_id: string | null; amount: number;
  currency: string; environment: string; status: string; access_ends_at: string | null; next_verification_at: string };

export async function reconcileVoarayOrder(order: Order, admin = voarayAdmin()) {
  const config = voarayConfig();
  if (!config.ready || order.environment !== config.environment || !order.provider_trx_id
    || !['pending', 'failed', 'canceled'].includes(order.status)) return order;
  // Atomic per-order lease bounds repeated browser polling to one request/minute/order.
  const now = new Date();
  const claimed = await admin.from('voaray_orders').update({ next_verification_at: new Date(now.getTime() + 60000).toISOString() })
    .eq('id', order.id).in('status', ['pending', 'failed', 'canceled']).lte('next_verification_at', now.toISOString()).select('id').maybeSingle();
  if (claimed.error) throw new ApiRouteError('Vérification temporairement indisponible.', 503);
  if (!claimed.data) return order;
  const response = await fetch('https://app.voaray.com/api/v1/verify-payment/' + encodeURIComponent(order.provider_trx_id), {
    headers: { Accept: 'application/json', 'X-Environment': config.environment,
      'X-Merchant-Key': config.merchantKey!, 'X-API-Key': config.apiKey!,
      'X-Signature': signature('', config.apiSecret!) }, signal: AbortSignal.timeout(5000), cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiRouteError('Confirmation Voaray temporairement indisponible.', 503);
  // Identity comes only from the provider response saved before checkout, never from the browser.
  if (result.trx_id !== order.provider_trx_id) throw new ApiRouteError('Référence Voaray incohérente.', 502);
  if (result.status !== 'success') return order;
  if (result.currency !== order.currency || !Number.isFinite(Number(result.amount))
    || Math.round(Number(result.amount) * 100) !== Math.round(Number(order.amount) * 100)
    || Number(result.refunded_amount ?? 0) !== 0) throw new ApiRouteError('Montant Voaray incohérent ou paiement remboursé.', 502);
  const fulfilled = await admin.rpc('fulfill_voaray_order', { p_order_id: order.id });
  if (fulfilled.error) {
    console.error('Voaray reconciliation failed', { orderId: order.id, code: fulfilled.error.code });
    throw new ApiRouteError('Activation à réessayer.', 503);
  }
  const refreshed = await admin.from('voaray_orders').select('*').eq('id', order.id).eq('user_id', order.user_id).single();
  if (refreshed.error) throw new ApiRouteError('Vérification temporairement indisponible.', 503);
  return refreshed.data as Order;
}

export async function reconcilePendingVoarayOrders() {
  const config = voarayConfig();
  if (!config.ready) return { configured: false };
  const admin = voarayAdmin();
  const pending = await admin.from('voaray_orders').select('*').eq('environment', config.environment)
    .in('status', ['pending', 'failed', 'canceled']).not('provider_trx_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .lte('next_verification_at', new Date().toISOString()).order('next_verification_at').limit(5);
  if (pending.error) throw new Error('Voaray reconciliation storage unavailable');
  let completed = 0, failed = 0;
  // Five bounded requests keep the scheduled function below Netlify's execution limit.
  await Promise.all((pending.data ?? []).map(async order => {
    try { const result = await reconcileVoarayOrder(order, admin); if (result.status === 'completed') completed++; }
    catch { failed++; }
  }));
  return { configured: true, checked: pending.data?.length ?? 0, completed, failed };
}
