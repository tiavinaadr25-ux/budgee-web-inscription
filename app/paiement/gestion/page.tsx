'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

type Summary = { canUpdateCard: boolean; cardRenews: boolean; cardEndsAt: string | null;
  access: { provider: string; status: string; current_period_end_at: string | null; trial_ends_at: string | null } | null };
const button = { padding: '13px 18px', background: '#2558a0', color: '#fff', border: 0, borderRadius: 10, font: 'inherit', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' } as const;
const card = { border: '1px solid #dce3ed', borderRadius: 18, padding: 24 };
const date = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
async function api(action?: string, sessionId?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Connexion indisponible.');
  const client = createClient(url, key);
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Reconnecte-toi à Kloo pour gérer ton paiement.');
  const response = await fetch('/api/payment-method' + (sessionId ? '?session_id=' + encodeURIComponent(sessionId) : ''), { method: action ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(action ? { body: JSON.stringify({ action }) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Gestion du paiement indisponible.');
  return result;
}
export default function PaymentManagement() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState('Vérification de ton abonnement…');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [available, setAvailable] = useState(false);
  const accessEnd = summary?.access?.status === 'trialing' ? summary.access.trial_ends_at : summary?.access?.current_period_end_at;
  const accessActive = Boolean(summary && (summary.access?.status === 'active' || (accessEnd && new Date(accessEnd).getTime() > Date.now()) || (summary.cardEndsAt && new Date(summary.cardEndsAt).getTime() > Date.now())));
  async function refresh() { setSummary(await api()); }
  useEffect(() => { let live = true;
    async function init() {
      const params = new URLSearchParams(window.location.search);
      let notice = '';
      if (params.get('card') === 'return') {
        await api('confirm-card', params.get('session_id') || '');
        notice = 'Ta nouvelle carte a été enregistrée pour les prochains renouvellements.';
      } else if (params.get('card') === 'cancel') notice = 'Modification annulée. Ta carte actuelle est conservée.';
      const s = await api();
      if (live) { setSummary(s); setMessage(notice); window.history.replaceState({}, '', '/paiement/gestion'); }
    }
    init().catch(e => { if (live) setMessage(e.message); });
    fetch('/api/voaray/checkout').then(r => r.json()).then(r => { if (live) setAvailable(r.available === true); }).catch(() => {});
    return () => { live = false; };
  }, []);
  async function act(action: string) {
    setBusy(true); setMessage('');
    try { const result = await api(action);
      if (result.url) { window.location.assign(result.url); return; }
      setConfirm(false); await refresh();
      setMessage(result.cardEndsAt ? `Renouvellement carte arrêté. Ton accès reste disponible jusqu’au ${date(result.cardEndsAt)}. Reviens à cette date pour payer par Mobile Money.` : 'Tu peux choisir Mobile Money à la fin de ton accès actuel.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Réessaie dans un instant.'); }
    finally { setBusy(false); }
  }
  async function payMobile() {
    if (busy || !available || accessActive) return;
    setBusy(true); setMessage('Ouverture du paiement sécurisé Voaray…');
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('Connexion indisponible.');
      const token = (await createClient(url, key).auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Reconnecte-toi pour continuer.');
      const response = await fetch('/api/voaray/checkout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || 'Le paiement est temporairement indisponible.');
      window.location.assign(result.url);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Le paiement est temporairement indisponible.'); setBusy(false); }
  }
  return <main className="payment-management" style={{ minHeight: '100vh', background: '#fff', padding: '32px 20px', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#18202d' }}>
    <style>{`.payment-management h1{font-size:clamp(30px,5vw,40px);line-height:1.2}.payment-management h2{font-size:23px;line-height:1.3;margin-bottom:16px}.payment-management h3{font-size:19px;margin-bottom:12px}.payment-management p{margin-bottom:16px}.payment-management button:disabled{opacity:.6;cursor:wait}.payment-management button:focus-visible{outline:3px solid #c97b0a;outline-offset:3px}`}</style>
    <div style={{ maxWidth: 800, margin: '0 auto', lineHeight: 1.65 }}>
      <a href="/app" style={{ color: '#2558a0' }}>← Retour à l’app</a>
      <h1 style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 400, margin: '24px 0 12px' }}>Mon mode de paiement</h1>
      <p>Carte bancaire ou Mobile Money : choisis comment continuer avec Kloo.</p>
      <p role="status" aria-live="polite" style={{ margin: '20px 0', color: '#2558a0' }}>{message}</p>
      {summary && <div style={{ display: 'grid', gap: 20 }}>
        <section style={card}><h2>Carte bancaire · 1,99 € / mois</h2>
          <p>Renouvellement automatique. Modifie ta carte dans l’espace sécurisé Stripe.</p>
          {summary.cardEndsAt && <p>{summary.cardRenews ? 'Période en cours jusqu’au ' : 'Renouvellement arrêté · accès jusqu’au '}{date(summary.cardEndsAt)}.</p>}
          {summary.canUpdateCard ? <button style={button} disabled={busy} onClick={() => act('portal')}>Modifier ma carte</button> : <p>Pour choisir la carte, ouvre la page de paiement à la fin de ton accès.</p>}
        </section>
        <section style={card}><h2>Mobile Money · 9 000 Ar pour un mois</h2>
          <p>Paiement via Voaray, sans renouvellement automatique. Les opérateurs disponibles, dont MVola si activé, sont affichés sur la page Voaray.</p>
          {summary.access?.provider === 'voaray' && summary.access.current_period_end_at && <p>Accès Mobile Money jusqu’au {date(summary.access.current_period_end_at)}.</p>}
          {!available ? <p>Le paiement Mobile Money est temporairement indisponible. Réessaie plus tard ou contacte le support.</p> : summary.cardRenews ? <>
            <button disabled={busy} style={button} onClick={() => setConfirm(true)}>Passer à Mobile Money</button>
            {confirm && <div style={{ marginTop: 18, padding: 18, background: '#e8f0fb', borderRadius: 12 }}>
              <h3>Arrêter le renouvellement carte ?</h3><p>Tu gardes ton accès jusqu’à son échéance. Tu pourras ensuite payer 9 000 Ar pour un mois par Mobile Money. Aucun paiement n’est effectué maintenant.</p>
              <button disabled={busy} style={button} onClick={() => act('switch-mobile')}>{busy ? 'Mise à jour…' : 'Confirmer le changement'}</button>{' '}
              <button disabled={busy} style={{ ...button, background: '#eef1f6', color: '#18202d' }} onClick={() => setConfirm(false)}>Garder la carte</button>
            </div>}
          </> : accessActive ? <p>Ton accès reste actif{accessEnd || summary.cardEndsAt ? ` jusqu’au ${date((accessEnd || summary.cardEndsAt)!)}` : ''}. Reviens à l’échéance pour payer par Mobile Money, sans payer deux fois la période en cours.</p> : <button disabled={busy} style={button} onClick={payMobile}>{busy ? 'Ouverture de Voaray…' : 'Payer 9 000 Ar par Mobile Money'}</button>}
          <p style={{ marginTop: 16 }}><a href="/paiement">Choisir un paiement à la fin de mon accès</a></p>
        </section>
      </div>}
      <p style={{ marginTop: 24 }}>Besoin d’aide ? <a href="mailto:contact@kloo.site">contact@kloo.site</a> · <a href="/connexion">Se reconnecter</a></p>
    </div>
  </main>;
}
