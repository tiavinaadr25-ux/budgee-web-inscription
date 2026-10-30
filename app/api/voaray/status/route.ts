import { NextRequest } from 'next/server';
import { ApiRouteError, ensureAllowedOrigin, jsonResponse, requireAuthenticatedUser } from '../../_lib/security';
import { voarayAdmin } from '../../_lib/voaray';
import { reconcileVoarayOrder } from '../../_lib/voaray-reconcile';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    ensureAllowedOrigin(request);
    const user = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const orderId = String(payload.orderId ?? '').trim();
    if (orderId && !/^[0-9a-f-]{36}$/i.test(orderId)) throw new ApiRouteError('Référence de paiement invalide.', 400);
    // Recover the latest order even when the payer closed Voaray before its redirect.
    const admin = voarayAdmin();
    let query = admin.from('voaray_orders').select('*')
      .eq('user_id', user.id);
    if (orderId) query = query.eq('id', orderId);
    const result = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new ApiRouteError('Vérification temporairement indisponible.', 503);
    if (!result.data) throw new ApiRouteError('Paiement introuvable.', 404);
    let order = result.data;
    try { order = await reconcileVoarayOrder(order, admin); }
    catch (error) { console.warn('Voaray status reconciliation delayed', { orderId: order.id,
      status: error instanceof ApiRouteError ? error.status : 503 }); }
    return jsonResponse(request, { id: order.id, status: order.status, access_ends_at: order.access_ends_at }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonResponse(request, { error: error instanceof ApiRouteError ? error.message : 'Vérification indisponible.' },
      { status: error instanceof ApiRouteError ? error.status : 500 });
  }
}
