'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;

const mobilePaymentOptions = [
  {
    id: 'mvola',
    label: 'MVola',
    description: 'Paiement Telma Madagascar',
    href: process.env.NEXT_PUBLIC_PAPI_MVOLA_URL?.trim() || undefined,
    borderColor: 'rgba(19, 154, 125, 0.18)',
    background: 'linear-gradient(180deg, rgba(244, 255, 252, 0.98), rgba(233, 250, 244, 0.98))',
    accent: '#13886e',
  },
  {
    id: 'orange-money',
    label: 'Orange Money',
    description: 'Paiement Orange Madagascar',
    href: process.env.NEXT_PUBLIC_PAPI_ORANGE_MONEY_URL?.trim() || undefined,
    borderColor: 'rgba(244, 130, 32, 0.2)',
    background: 'linear-gradient(180deg, rgba(255, 251, 244, 0.98), rgba(255, 244, 229, 0.98))',
    accent: '#d97812',
  },
  {
    id: 'airtel-money',
    label: 'Airtel Money',
    description: 'Paiement Airtel Madagascar',
    href: process.env.NEXT_PUBLIC_PAPI_AIRTEL_MONEY_URL?.trim() || undefined,
    borderColor: 'rgba(220, 54, 74, 0.18)',
    background: 'linear-gradient(180deg, rgba(255, 246, 247, 0.98), rgba(255, 236, 239, 0.98))',
    accent: '#c02d42',
  },
] as const;

type PageState = 'loading' | 'guest' | 'payment' | 'active';

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

  const hasConfiguredMobilePayment = useMemo(
    () => mobilePaymentOptions.some((option) => Boolean(option.href)),
    [],
  );

  useEffect(() => {
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

      if (searchParams.get('checkout') === 'cancel') {
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

  const title =
    pageState === 'active'
      ? 'Ton accès est déjà actif'
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
        <div style={pageStyles.kicker}>Paiement Kloo</div>
        <h1 style={pageStyles.title}>{title}</h1>
        <p style={pageStyles.lead}>{lead}</p>
        <p style={pageStyles.info}>{message}</p>

        {pageState === 'guest' ? (
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
              <div style={pageStyles.mobileGrid}>
                {mobilePaymentOptions.map((option) =>
                  option.href ? (
                    <a
                      key={option.id}
                      href={option.href}
                      style={{
                        ...pageStyles.mobileButton,
                        border: `1px solid ${option.borderColor}`,
                        background: option.background,
                        color: '#18202d',
                      }}
                    >
                      <span style={pageStyles.mobileLabel}>{option.label}</span>
                      <span style={pageStyles.mobileCopy}>{option.description}</span>
                      <span style={{ ...pageStyles.mobileState, color: option.accent }}>
                        Payer avec {option.label}
                      </span>
                    </a>
                  ) : (
                    <div
                      key={option.id}
                      style={{
                        ...pageStyles.mobileButton,
                        border: `1px solid ${option.borderColor}`,
                        background: option.background,
                        color: '#18202d',
                        opacity: 0.76,
                      }}
                    >
                      <span style={pageStyles.mobileLabel}>{option.label}</span>
                      <span style={pageStyles.mobileCopy}>{option.description}</span>
                      <span style={{ ...pageStyles.mobileState, color: option.accent }}>
                        Bientôt disponible
                      </span>
                    </div>
                  ),
                )}
              </div>
              <p style={pageStyles.footer}>
                {hasConfiguredMobilePayment
                  ? 'Les moyens de paiement mobiles sont visibles uniquement ici, après l’essai gratuit.'
                  : 'Les paiements mobiles sont prêts à être branchés ici dès que tes liens PAPI seront ajoutés.'}
              </p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
