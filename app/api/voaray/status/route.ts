import { NextRequest } from 'next/server';
import { ApiRouteError, ensureAllowedOrigin, jsonResponse, requireAuthenticatedUser } from '../../_lib/security';
import { voarayAdmin } from '../../_lib/voaray';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    ensureAllowedOrigin(request);
    const user = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const orderId = String(payload.orderId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ApiRouteError('Référence de paiement invalide.', 400);
    const result = await voarayAdmin().from('voaray_orders').select('id, status, access_ends_at')
      .eq('id', orderId).eq('user_id', user.id).maybeSingle();
    if (result.error) throw new ApiRouteError('Vérification temporairement indisponible.', 503);
    if (!result.data) throw new ApiRouteError('Paiement introuvable.', 404);
    return jsonResponse(request, result.data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonResponse(request, { error: error instanceof ApiRouteError ? error.message : 'Vérification indisponible.' },
      { status: error instanceof ApiRouteError ? error.status : 500 });
  }
}
