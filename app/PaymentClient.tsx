'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;

type PageState = 'loading' | 'guest' | 'payment' | 'active' | 'confirming';

type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  profileType: string;
};

type SubscriptionRow = {
  status: string;
  trial_ends_at: string | null;
  current_period_end_at: string | null;
};

function hasSubscriptionAccess(subscription: SubscriptionRow | null | undefined) {
  if (!subscription) {
    return false;
  }

  const now = Date.now();

  if (subscription.status === 'trialing') {
    if (!subscription.trial_ends_at) {
      return true;
    }

    return new Date(subscription.trial_ends_at).getTime() > now;
  }

  if (subscription.status === 'active') {
    return true;
  }

  if (
    (subscription.status === 'past_due' || subscription.status === 'canceled') &&
    subscription.current_period_end_at
  ) {
    return new Date(subscription.current_period_end_at).getTime() > now;
  }

  return false;
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Ajoute NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pour activer Kloo web.',
    );
  }

  return supabase;
}

async function fetchCurrentSubscription(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('subscriptions')
    .select('id, status, trial_ends_at, current_period_end_at, cancel_at_period_end')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getAuthorizedJsonHeaders() {
  const accessToken = (await getSupabaseClient().auth.getSession()).data.session?.access_token?.trim();

  if (!accessToken) {
    throw new Error('Reconnecte-toi à Kloo pour continuer en sécurité.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

async function syncSubscriptionAccess(userId: string, email: string) {
  const headers = await getAuthorizedJsonHeaders();
  const response = await fetch('/api/stripe/sync-access', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userId,
      email,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || 'Impossible de vérifier ton abonnement Kloo pour le moment.',
    );
  }

  return payload.subscription ?? null;
}

async function confirmCheckoutSession(sessionId: string) {
  const headers = await getAuthorizedJsonHeaders();
  const response = await fetch('/api/stripe/confirm-checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || 'Le paiement est revenu, mais Kloo n’a pas encore confirmé ton accès.',
    );
  }

  return payload;
}

async function launchCheckout(user: SessionUser) {
  const headers = await getAuthorizedJsonHeaders();
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      profileType: user.profileType,
      returnPath: '/paiement',
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.url) {
    throw new Error(
      payload.error || 'Le paiement sécurisé n’est pas disponible pour le moment.',
    );
  }

  window.location.href = payload.url;
}

const pageStyles = {
  main: {
    minHeight: '100vh',
    margin: 0,
    padding: '32px 18px',
    fontFamily: 'var(--font-dm-sans), sans-serif',
    color: '#18202d',
    background: 'linear-gradient(180deg, #fcfaf5 0%, #f3ebdf 100%)',
  },
  section: {
    maxWidth: '940px',
    margin: '0 auto',
    position: 'relative',
    padding: '28px',
    borderRadius: '28px',
    border: '1px solid rgba(41, 57, 85, 0.14)',
    background: 'rgba(255, 251, 244, 0.97)',
    boxShadow: '0 24px 54px rgba(36, 46, 66, 0.12)',
  },
  closeLink: {
    position: 'absolute',
    top: '18px',
    right: '18px',
    width: '40px',
    height: '40px',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#18202d',
    textDecoration: 'none',
    fontSize: '1.6rem',
    fontWeight: 700,
    background: 'rgba(255, 255, 255, 0.84)',
    border: '1px solid rgba(41, 57, 85, 0.12)',
    boxShadow: '0 10px 24px rgba(36, 46, 66, 0.08)',
  },
  kicker: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '999px',
    background: 'rgba(205, 150, 31, 0.12)',
    color: '#8d5f00',
    fontSize: '0.76rem',
    fontWeight: 800,
    marginBottom: '14px',
  },
  title: {
    margin: '0 56px 10px 0',
    fontSize: '2rem',
    letterSpacing: '-0.05em',
  },
  lead: {
    margin: '0 56px 18px 0',
    color: '#485366',
    lineHeight: 1.7,
    fontSize: '0.98rem',
  },
  info: {
    margin: '0 0 18px',
    padding: '14px 16px',
    borderRadius: '16px',
    background: 'rgba(233, 242, 252, 0.92)',
    color: '#244e82',
    lineHeight: 1.6,
    fontSize: '0.92rem',
  },
  sectionBlock: {
    marginTop: '18px',
  },
  sectionTitle: {
    margin: '0 0 6px',
    fontSize: '1.16rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  sectionCopy: {
    margin: '0 0 14px',
    color: '#5a6576',
    lineHeight: 1.6,
    fontSize: '0.9rem',
  },
  grid: {
    display: 'grid',
    gap: '16px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  },
  card: {
    padding: '18px',
    borderRadius: '20px',
    border: '1px solid rgba(41, 57, 85, 0.1)',
    background: 'rgba(255, 255, 255, 0.92)',
    boxShadow: '0 12px 28px rgba(27, 36, 54, 0.08)',
  },
  cardTitle: {
    margin: '0 0 6px',
    fontSize: '1rem',
    fontWeight: 800,
  },
  cardText: {
    margin: '0 0 14px',
    color: '#485366',
    lineHeight: 1.6,
    fontSize: '0.88rem',
  },
  primaryButton: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '48px',
    padding: '12px 16px',
    borderRadius: '999px',
    border: 'none',
    background: '#2558a0',
    color: '#fff',
    font: 'inherit',
    fontSize: '0.95rem',
    fontWeight: 800,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  secondaryButton: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '48px',
    padding: '12px 16px',
    borderRadius: '999px',
    border: '1px solid rgba(41, 57, 85, 0.13)',
    background: 'rgba(255, 255, 255, 0.9)',
    color: '#18202d',
    font: 'inherit',
    fontSize: '0.95rem',
    fontWeight: 800,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  mobileWrap: {
    marginTop: '20px',
  },
  mobileTitle: {
    margin: '0 0 10px',
    fontSize: '1.08rem',
    letterSpacing: '-0.03em',
  },
  mobileGrid: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  },
  mobileButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    minHeight: '120px',
    padding: '16px',
    borderRadius: '18px',
    textDecoration: 'none',
    boxShadow: '0 10px 24px rgba(27, 36, 54, 0.08)',
  },
  mobileLabel: {
    fontSize: '0.96rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  mobileCopy: {
    marginTop: '6px',
    fontSize: '0.8rem',
    lineHeight: 1.5,
    color: '#485366',
  },
  mobileState: {
    marginTop: 'auto',
    paddingTop: '12px',
    fontSize: '0.74rem',
    fontWeight: 800,
  },
  footer: {
    marginTop: '18px',
    color: '#5a6576',
    lineHeight: 1.6,
    fontSize: '0.88rem',
  },
} as const;

export default function PaymentClient() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [message, setMessage] = useState('On vérifie ton accès Kloo...');
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mobilePayment, setMobilePayment] = useState({ available: false, amount: 9000, currency: 'MGA', sandbox: false });

  useEffect(() => {
    let disposed = false;
    fetch('/api/voaray/checkout').then((response) => response.json()).then((data) => {
      if (!disposed) setMobilePayment({ available: data.available === true, amount: data.amount ?? 9000, currency: data.currency ?? 'MGA', sandbox: data.sandbox === true });
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    let disposed = false;
    async function init() {
      if (!supabase) {
        setPageState('guest');
        setMessage(
          'La connexion Kloo n’est pas disponible pour le moment. Réessaie dans un instant.',
        );
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const { data: sessionData } = await getSupabaseClient().auth.getSession();

      if (!sessionData.session) {
        setPageState('guest');
        setMessage('Connecte-toi pour ouvrir la page paiement Kloo.');
        return;
      }

      const sessionUser: SessionUser = {
        id: sessionData.session.user.id,
        email: sessionData.session.user.email ?? '',
        fullName:
          String(
            (sessionData.session.user.user_metadata as { name?: string } | undefined)?.name ?? '',
          ).trim(),
        profileType:
          String(
            (sessionData.session.user.user_metadata as { profile_type?: string } | undefined)
              ?.profile_type ?? '',
          ).trim(),
      };

      setCurrentUser(sessionUser);

      if (searchParams.get('voaray') === 'return' && searchParams.get('order')) {
        setPageState('confirming');
        setMessage('On attend la confirmation de Voaray. Ton accès sera activé dès que le paiement sera confirmé.');
        try {
          for (let attempt = 0; attempt < 12; attempt++) {
            if (disposed) return;
            const response = await fetch('/api/voaray/status', { method: 'POST', headers: await getAuthorizedJsonHeaders(), body: JSON.stringify({ orderId: searchParams.get('order') }) });
            const result = await response.json();
            if (disposed) return;
            if (!response.ok) throw new Error(result.error || 'La vérification est temporairement indisponible.');
            if (result.status === 'completed') {
              setPageState('active');
              setMessage('Paiement Voaray confirmé. Ton mois d’accès Kloo est actif.');
              window.history.replaceState({}, '', '/paiement');
              return;
            }
            if (result.status === 'sandbox_completed') {
              setPageState('payment'); setMessage('Paiement de test confirmé. Aucun accès réel n’a été activé.'); return;
            }
            if (['failed', 'canceled', 'refunded', 'duplicate_payment'].includes(result.status)) {
              setPageState('payment'); setMessage(result.status === 'duplicate_payment' ? 'Un autre paiement a déjà été reçu pour cette période. Contacte le support pour vérifier ce paiement supplémentaire.' : 'Ce paiement n’a pas activé d’accès. Vérifie son état avant de réessayer, ou contacte le support.'); return;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
          }
          if (!disposed) setMessage('La confirmation prend un peu de temps. Vérifie à nouveau dans un instant ; ne repaie pas une seconde fois.');
        } catch (error) {
          if (!disposed) setMessage(error instanceof Error ? error.message : 'Vérification indisponible. Réessaie dans un instant.');
        }
        return;
      }


      if (searchParams.get('voaray') === 'cancel' || searchParams.get('checkout') === 'cancel') {
        setPageState('payment');
        setMessage('Paiement annulé. Tu peux reprendre quand tu veux depuis cette page.');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      if (searchParams.get('checkout') === 'success') {
        const sessionId = String(searchParams.get('session_id') ?? '').trim();

        if (sessionId) {
          try {
            await confirmCheckoutSession(sessionId);
            setPageState('active');
            setMessage('Paiement enregistré. Ton accès Kloo est actif.');
            window.history.replaceState({}, document.title, window.location.pathname);
            window.setTimeout(() => {
              window.location.assign('/app');
            }, 500);
            return;
          } catch (error) {
            setPageState('payment');
            setMessage(
              error instanceof Error
                ? error.message
                : 'Le paiement est revenu, mais Kloo n’a pas encore confirmé ton accès.',
            );
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
        }
      }

      try {
        let subscription = await fetchCurrentSubscription(sessionUser.id);

        if (!hasSubscriptionAccess(subscription)) {
          subscription = await syncSubscriptionAccess(sessionUser.id, sessionUser.email);
        }

        if (hasSubscriptionAccess(subscription)) {
          setPageState('active');
          setMessage('Ton accès Kloo est déjà actif. Tu peux retourner dans l’app.');
          return;
        }

        setPageState('payment');
        setMessage(
          'Ton essai gratuit est terminé ou ton paiement doit être repris. Choisis ici ton moyen de paiement pour continuer avec Kloo.',
        );
      } catch (error) {
        setPageState('payment');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Impossible de vérifier ton accès pour le moment.',
        );
      }
    }

    void init();
    return () => { disposed = true; };
  }, []);

  async function handleCardPayment() {
    if (!currentUser) {
      window.location.assign('/connexion');
      return;
    }

    try {
      setIsSubmitting(true);
      await launchCheckout(currentUser);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Le paiement sécurisé n’est pas disponible pour le moment.',
      );
      setIsSubmitting(false);
    }
  }

  async function handleMobilePayment() {
    if (!currentUser || isSubmitting || pageState !== 'payment') return;
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/voaray/checkout', { method: 'POST', headers: await getAuthorizedJsonHeaders() });
      const payload = await response.json();
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Le paiement Mobile Money est indisponible.');
      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Voaray est temporairement indisponible.');
      setIsSubmitting(false);
    }
  }

  const title =
    pageState === 'confirming' ? 'Confirmation du paiement' : pageState === 'loading' ? 'Vérification de ton accès' : pageState === 'active'
      ? 'Ton accès est actif'
      : pageState === 'guest'
        ? 'Connexion requise'
        : 'Choisis ton paiement';

  const lead =
    pageState === 'active'
      ? 'Ton abonnement ou ton essai Kloo est bien reconnu. Tu peux rouvrir l’app tout de suite.'
      : pageState === 'guest'
        ? 'Cette page sert à finaliser un paiement ou à reprendre un accès Kloo après l’essai gratuit.'
        : 'Choisis ici entre le paiement par carte via Stripe et les moyens de paiement mobile pour Madagascar.';

  return (
    <main style={pageStyles.main}>
      <section style={pageStyles.section}>
        <a href="/" aria-label="Fermer" title="Fermer" style={pageStyles.closeLink}>
          ×
        </a>
        <div style={pageStyles.kicker}>Paiement Kloo</div><p style={{ marginBottom: 18 }}><a href="/paiement/gestion">Gérer ma carte ou passer à Mobile Money</a></p>
        <h1 style={pageStyles.title}>{title}</h1>
        <p style={pageStyles.lead}>{lead}</p>
        <p style={pageStyles.info} role="status" aria-live="polite">{message}</p>

        {pageState === 'loading' ? <p>Vérification en cours…</p> : pageState === 'confirming' ? (
          <div style={pageStyles.card}><p style={pageStyles.cardText}>Ton paiement est en cours de vérification. Tu pourras ouvrir Kloo dès sa confirmation.</p><button type="button" style={pageStyles.primaryButton} onClick={() => window.location.reload()}>Vérifier à nouveau</button><p style={pageStyles.footer}><a href="mailto:contact@kloo.site">Contacter le support</a></p></div>
        ) : pageState === 'guest' ? (
          <div style={pageStyles.grid}>
            <div style={pageStyles.card}>
              <h2 style={pageStyles.cardTitle}>Ouvre d’abord ta connexion</h2>
              <p style={pageStyles.cardText}>
                Connecte-toi avec ton compte Kloo pour accéder à la page paiement liée à ton abonnement.
              </p>
              <a href="/connexion" style={pageStyles.primaryButton}>
                Aller à la connexion
              </a>
            </div>
          </div>
        ) : pageState === 'active' ? (
          <div style={pageStyles.grid}>
            <div style={pageStyles.card}>
              <h2 style={pageStyles.cardTitle}>Accès confirmé</h2>
              <p style={pageStyles.cardText}>
                Ton accès Kloo est prêt. Tu peux retourner dans l’app web immédiatement.
              </p>
              <a href="/app" style={pageStyles.primaryButton}>
                Ouvrir l’app Kloo
              </a>
            </div>
          </div>
        ) : (
          <>
            <div style={pageStyles.sectionBlock}>
              <h2 style={pageStyles.sectionTitle}>Carte bancaire (Stripe)</h2>
              <p style={pageStyles.sectionCopy}>
                Pour les cartes bancaires internationales, Kloo ouvre le checkout
                Stripe sécurisé puis te renvoie ici après validation.
              </p>
              <div style={pageStyles.grid}>
                <div style={pageStyles.card}>
                  <h3 style={pageStyles.cardTitle}>Payer par carte via Stripe</h3>
                  <p style={pageStyles.cardText}>
                    Continue avec le paiement sécurisé par carte pour reprendre
                    immédiatement ton accès Kloo.
                  </p>
                  <button
                    type="button"
                    onClick={handleCardPayment}
                    disabled={isSubmitting}
                    style={{
                      ...pageStyles.primaryButton,
                      opacity: isSubmitting ? 0.72 : 1,
                    }}
                  >
                    {isSubmitting ? 'Ouverture de Stripe...' : 'Payer par carte'}
                  </button>
                </div>
                <div style={pageStyles.card}>
                  <h3 style={pageStyles.cardTitle}>Besoin d’aide ?</h3>
                  <p style={pageStyles.cardText}>
                    Si ton essai est fini ou si ton abonnement a besoin d’être
                    mis à jour, cette page reste ton point d’entrée unique.
                  </p>
                  <a href="mailto:contact@kloo.site" style={pageStyles.secondaryButton}>
                    Contacter le support
                  </a>
                </div>
              </div>
            </div>

            <div style={pageStyles.mobileWrap}>
              <h2 style={pageStyles.sectionTitle}>Paiement mobile Madagascar</h2>
              <p style={pageStyles.sectionCopy}>
                Ces moyens de paiement apparaissent uniquement ici, après
                l’essai gratuit, pour les utilisateurs qui préfèrent payer avec
                MVola, Orange Money ou Airtel Money.
              </p>
              <div style={pageStyles.card}>
                <h3 style={pageStyles.cardTitle}>Mobile Money avec Voaray</h3>
                <p style={pageStyles.cardText}><strong>{new Intl.NumberFormat('fr-FR').format(mobilePayment.amount)} {mobilePayment.currency === 'MGA' ? 'Ar' : mobilePayment.currency}</strong> pour un mois d’accès. Paiement ponctuel, sans renouvellement automatique.</p>
                <p style={pageStyles.cardText}>MVola · Orange Money · Airtel Money. Choisis ton moyen de paiement parmi ceux disponibles sur la page sécurisée Voaray.</p>
                <button type="button" style={{ ...pageStyles.primaryButton, opacity: mobilePayment.available && !isSubmitting ? 1 : 0.6 }} disabled={!mobilePayment.available || isSubmitting} onClick={handleMobilePayment}>
                  {isSubmitting ? 'Ouverture du paiement…' : mobilePayment.available ? 'Payer avec Voaray' : 'Mobile Money bientôt disponible'}
                </button>
                <p style={pageStyles.footer}>{mobilePayment.sandbox ? 'Mode test : aucun accès réel ne sera activé.' : 'Ton mois d’accès commence après confirmation du paiement par Voaray.'}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
