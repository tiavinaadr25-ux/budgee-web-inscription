import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ApiRouteError } from './api-error';

export function voarayConfig() {
  const environment = process.env.VOARAY_ENVIRONMENT?.trim() || 'sandbox';
  const amount = Number(process.env.VOARAY_PRICE_AMOUNT);
  const currency = process.env.VOARAY_CURRENCY?.trim().toUpperCase() || 'MGA';
  const apiKey = process.env.VOARAY_API_KEY?.trim();
  const merchantKey = process.env.VOARAY_MERCHANT_KEY?.trim();
  const apiSecret = process.env.VOARAY_API_SECRET?.trim();
  const webhookSecret = process.env.VOARAY_WEBHOOK_SECRET?.trim();
  const siteUrl = process.env.SITE_URL?.trim();
  let publicSite = false;
  try {
    const url = new URL(siteUrl ?? '');
    publicSite = url.protocol === 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  } catch {}
  const ready = Boolean(publicSite && apiKey && merchantKey && apiSecret && webhookSecret && siteUrl
    && ['sandbox', 'production'].includes(environment)
    && Number.isFinite(amount) && amount >= 1 && Math.round(amount * 100) === amount * 100
    && /^[A-Z]{3}$/.test(currency));
  return { environment, amount, currency, apiKey, merchantKey, apiSecret, webhookSecret, siteUrl, ready };
}

export function voarayAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiRouteError('Le service de paiement est temporairement indisponible.', 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function signature(body: string, secret: string) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function validSignature(body: string, received: string | null, secret: string) {
  // Voaray documents both a bare digest and the Node.js sha256= form.
  const digest = received?.trim().replace(/^sha256=/i, '');
  if (!digest || !/^[0-9a-f]{64}$/i.test(digest)) return false;
  return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature(body, secret), 'hex'));
}

export function accessIsActive(row: { status: string; trial_ends_at?: string | null; current_period_end_at?: string | null } | null) {
  if (!row) return false;
  if (row.status === 'active') return true;
  if (row.status === 'trialing') return !row.trial_ends_at || new Date(row.trial_ends_at).getTime() > Date.now();
  return ['canceled', 'past_due'].includes(row.status) && Boolean(row.current_period_end_at && new Date(row.current_period_end_at).getTime() > Date.now());
}

export async function initiateVoarayPayment(payload: Record<string, unknown>) {
  const config = voarayConfig();
  if (!config.ready) throw new ApiRouteError('Le paiement Mobile Money n’est pas encore disponible.', 503);
  const body = JSON.stringify(payload);
  const response = await fetch('https://app.voaray.com/api/v1/initiate-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
      'X-Environment': config.environment, 'X-Merchant-Key': config.merchantKey!,
      'X-API-Key': config.apiKey!, 'X-Signature': signature(body, config.apiSecret!) },
    body, signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.payment_url !== 'string') {
    throw new ApiRouteError('Voaray n’a pas pu ouvrir le paiement. Réessaie dans un instant.', 502);
  }
  const url = new URL(data.payment_url);
  if (url.protocol !== 'https:' || !['app.voaray.com', 'checkout.voaray.com'].includes(url.hostname) || url.username || url.password) {
    throw new ApiRouteError('Le lien de paiement Voaray n’a pas pu être vérifié.', 502);
  }
  const candidates = [data.trx_id, data.transaction_id, data.info?.trx_id,
    data.info?.transaction_id, data.info?.ref_trx];
  const transactionId = candidates.find(value => typeof value === 'string'
    && /^(?:(?:SANDBOX|PRODUCTION)_)?TXN[A-Z0-9]{6,80}$/i.test(value));
  if (!transactionId) throw new ApiRouteError('La référence Voaray n’a pas pu être enregistrée. Aucun paiement n’a été ouvert. Contacte le support.', 502);
  return { url: url.href, transactionId: transactionId as string };
}
