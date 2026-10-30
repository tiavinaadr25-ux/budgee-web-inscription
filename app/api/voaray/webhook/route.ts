import { NextRequest } from 'next/server';
import { ApiRouteError, jsonResponse } from '../../_lib/security';
import { validSignature, voarayAdmin, voarayConfig } from '../../_lib/voaray';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const config = voarayConfig();
    if (!config.ready) throw new ApiRouteError('Webhook non configuré.', 503);
    if (Number(request.headers.get('content-length') ?? 0) > 65536) throw new ApiRouteError('Charge utile trop grande.', 413);
    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > 65536) throw new ApiRouteError('Charge utile trop grande.', 413);
    if (!validSignature(body, request.headers.get('x-signature'), config.webhookSecret!)) throw new ApiRouteError('Signature invalide.', 401);
    const payload = JSON.parse(body);
    const data = payload.data ?? {};
    if (data.environment !== config.environment || (request.headers.get('x-environment') && request.headers.get('x-environment') !== config.environment)) throw new ApiRouteError('Environnement invalide.', 400);
    const reference = String(data.ref_trx ?? '');
    const isOrderId = /^[0-9a-f-]{36}$/i.test(reference);
    if (!isOrderId && !/^(?:(?:SANDBOX|PRODUCTION)_)?TXN[A-Z0-9]{6,80}$/i.test(reference)) throw new ApiRouteError('Référence invalide.', 400);
    const admin = voarayAdmin();
    const order = await admin.from('voaray_orders').select('id, amount, currency, environment')
      .eq(isOrderId ? 'id' : 'provider_trx_id', reference).eq('environment', config.environment).maybeSingle();
    if (order.error) throw new ApiRouteError('Stockage indisponible.', 503);
    if (!order.data) throw new ApiRouteError('Commande introuvable.', 404);
    if (order.data.environment !== data.environment || order.data.currency !== data.currency_code
      || !Number.isFinite(Number(data.amount)) || Math.round(Number(order.data.amount) * 100) !== Math.round(Number(data.amount) * 100)) throw new ApiRouteError('Montant ou devise invalide.', 400);
    const status = String(payload.status ?? '').toLowerCase();
    // Only signed, matched completion events can activate access. A browser redirect never does.
    if (['completed', 'terminé'].includes(status)) {
      const result = await admin.rpc('fulfill_voaray_order', { p_order_id: order.data.id });
      if (result.error) {
        console.error('Voaray fulfillment failed', { orderId: order.data.id, code: result.error.code });
        throw new ApiRouteError('Activation à réessayer.', 503);
      }
    } else if (['refunded', 'partially_refunded'].includes(status)) {
      const result = await admin.rpc('refund_voaray_order', { p_order_id: order.data.id });
      if (result.error) throw new ApiRouteError('Mise à jour à réessayer.', 503);
    } else if (['failed', 'canceled', 'cancelled', 'expired'].includes(status)) {
      const result = await admin.from('voaray_orders').update({ status: status === 'failed' ? 'failed' : 'canceled', updated_at: new Date().toISOString() })
        .eq('id', order.data.id).eq('status', 'pending');
      if (result.error) throw new ApiRouteError('Mise à jour à réessayer.', 503);
    }
    return jsonResponse(request, { received: true });
  } catch (error) {
    // Keep retry failures diagnosable without logging payloads, signatures or credentials.
    console.warn('Voaray webhook rejected', { status: error instanceof ApiRouteError ? error.status : 400,
      reason: error instanceof ApiRouteError ? error.message : 'Invalid payload' });
    return jsonResponse(request, { error: error instanceof ApiRouteError ? error.message : 'Notification invalide.' },
      { status: error instanceof ApiRouteError ? error.status : 400 });
  }
}
