'use client';
import { useState } from 'react';

const steps = ['Choisir Mobile Money', 'Ouvrir Voaray', 'Valider le paiement', 'Revenir sur Kloo'];
const button = { padding: '13px 20px', borderRadius: 10, border: 0, background: '#2558a0', color: '#fff', font: 'inherit', cursor: 'pointer' };
export default function Simulation() {
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState('success');
  return <main className="payment-demo" style={{ minHeight: '100vh', background: '#fff', padding: '30px 20px', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#18202d' }}>
    <style>{`.payment-demo h1{font-size:clamp(30px,5vw,40px);line-height:1.2;margin:10px 0 18px}.payment-demo h2{font-size:24px;line-height:1.3;margin:6px 0 18px}.payment-demo h3{font-size:20px;margin:8px 0 14px}.payment-demo p{margin-bottom:16px}.payment-demo button:focus-visible,.payment-demo select:focus-visible{outline:3px solid #c97b0a;outline-offset:3px}`}</style>
    <div style={{ maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>
      <a href="/paiement/gestion">← Modes de paiement</a>
      <p style={{ color: '#8d5f00', marginTop: 24 }}>DÉMONSTRATION · Aucun paiement réel</p>
      <h1 style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 400 }}>Payer Kloo par Mobile Money</h1>
      <p>Un exemple du parcours pour un mois à 9 000 Ar. Cette simulation illustre les étapes ; les écrans et consignes exacts de Voaray et de ton opérateur peuvent varier.</p>
      <ol style={{ margin: '24px 0', paddingLeft: 24 }}>{steps.map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined} style={{ fontWeight: i === step ? 700 : 400, color: i === step ? '#2558a0' : '#5a6576' }}>{label}</li>)}</ol>
      <section style={{ border: '1px solid #dce3ed', borderRadius: 20, padding: 28, background: '#f8faff', minHeight: 270 }}>
        <p>Étape {step + 1} sur 4</p><h2>{steps[step]}</h2>
        {step === 0 && <><p>Ton essai ou ton accès est terminé. Dans Kloo, tu ouvres « Paiement » et choisis Mobile Money.</p><p><strong>Kloo · Un mois · 9 000 Ar</strong><br />Sans renouvellement automatique.</p><button style={button} onClick={() => setStep(1)}>Simuler « Payer avec Voaray »</button></>}
        {step === 1 && <><p>Kloo te redirige vers la page sécurisée de Voaray. Tu vérifies le montant et choisis un opérateur parmi ceux proposés, par exemple MVola si disponible.</p><p>Tu renseignes les informations demandées par Voaray. Pour cette démonstration, aucune donnée n’est nécessaire.</p><button style={button} onClick={() => setStep(2)}>Continuer la simulation</button></>}
        {step === 2 && <><p>Tu suis les instructions de Voaray et de ton opérateur pour autoriser les 9 000 Ar. Ton code secret Mobile Money reste réservé au canal sécurisé de ton opérateur.</p><label htmlFor="outcome">Quel résultat veux-tu simuler ? </label><select id="outcome" value={outcome} onChange={e => setOutcome(e.target.value)} style={{ padding: 10, margin: '12px 0' }}><option value="success">Paiement confirmé</option><option value="pending">Confirmation en attente</option><option value="failed">Paiement échoué ou annulé</option></select><p><button style={button} onClick={() => setStep(3)}>Voir le retour sur Kloo</button></p></>}
        {step === 3 && <div role="status">{outcome === 'success' ? <><h3>Exemple : paiement confirmé</h3><p>Voaray confirme le paiement au serveur Kloo. Un mois d’accès est activé, puis tu peux rouvrir l’application. À l’échéance, tu choisis de payer à nouveau.</p></> : outcome === 'pending' ? <><h3>Exemple : en attente</h3><p>Kloo attend la confirmation de Voaray. Tu vérifies à nouveau dans un instant, sans payer une deuxième fois. Si l’attente persiste, contacte le support.</p></> : <><h3>Exemple : paiement non confirmé</h3><p>Aucun accès n’est activé. Vérifie le statut de l’opération chez ton opérateur avant de recommencer. Si tu as été débité, contacte le support sans repayer.</p></>}<p><strong>Ceci est une simulation : aucun débit et aucun accès réel n’ont été créés.</strong></p><button style={button} onClick={() => setStep(0)}>Recommencer</button></div>}
      </section>
      {step > 0 && <button style={{ ...button, background: '#eef1f6', color: '#18202d', marginTop: 20 }} onClick={() => setStep(step - 1)}>Étape précédente</button>}
      <p style={{ marginTop: 24 }}>Déjà abonné par carte ? Arrête d’abord le renouvellement depuis « Mode de paiement ». Ton accès reste actif jusqu’à l’échéance ; le paiement Mobile Money s’ouvre ensuite.</p>
    </div>
  </main>;
}
