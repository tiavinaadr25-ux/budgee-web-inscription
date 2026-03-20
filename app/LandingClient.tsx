'use client';

// MIGRATED FROM: index.html
import { createClient } from '@supabase/supabase-js';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

const supabaseUrl = 'https://wbxcigccadbkzxrmtpqp.supabase.co';
const supabasePublishableKey = 'sb_publishable_FjCxygFFtvLN8Nt71TAAMA_z56vZ47o';
const supabase = createClient(supabaseUrl, supabasePublishableKey);
const pendingSignupStorageKey = 'budgee-pending-signup';

type AuthMode = 'signup' | 'login' | 'recovery';
type StatusVariant = 'info' | 'success' | 'error';

type PendingSignup = {
  email: string;
  fullName: string;
  profileType: string;
  promoCode: string;
};

function hasSubscriptionAccess(
  subscription:
    | {
        status: string;
        current_period_end_at: string | null;
      }
    | null
    | undefined,
) {
  if (!subscription) {
    return false;
  }

  if (subscription.status === 'trialing' || subscription.status === 'active') {
    return true;
  }

  if (
    (subscription.status === 'past_due' || subscription.status === 'canceled') &&
    subscription.current_period_end_at
  ) {
    return new Date(subscription.current_period_end_at).getTime() > Date.now();
  }

  return false;
}

async function fetchCurrentSubscription(userId: string) {
  const { data, error } = await supabase
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

async function launchCheckout({
  userId,
  email,
  fullName,
  profileType,
  promoCode,
}: {
  userId: string;
  email: string;
  fullName: string;
  profileType: string;
  promoCode: string;
}) {
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      email,
      fullName,
      profileType,
      promoCode,
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

function getAuthParams() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return {
    hashType: hash.get('type'),
    searchType: search.get('type'),
    hasCode: search.has('code'),
    hasAccessToken: hash.has('access_token'),
  };
}

function getRedirectUrl() {
  return window.location.href.split('#')[0];
}

function savePendingSignup(payload: PendingSignup) {
  try {
    localStorage.setItem(pendingSignupStorageKey, JSON.stringify(payload));
  } catch (storageError) {
    console.warn('Impossible de mémoriser le signup Budgee.', storageError);
  }
}

function readPendingSignup() {
  try {
    const rawValue = localStorage.getItem(pendingSignupStorageKey);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as PendingSignup;
  } catch (storageError) {
    console.warn('Impossible de lire le signup Budgee en attente.', storageError);
    return null;
  }
}

function clearPendingSignup() {
  try {
    localStorage.removeItem(pendingSignupStorageKey);
  } catch (storageError) {
    console.warn('Impossible de nettoyer le signup Budgee en attente.', storageError);
  }
}

function getPendingSignupForEmail(email: string) {
  const pendingSignup = readPendingSignup();
  if (!pendingSignup || !email) {
    return null;
  }

  return pendingSignup.email === email.toLowerCase() ? pendingSignup : null;
}

export default function LandingClient() {
  const [authMode, setAuthModeState] = useState<AuthMode>('signup');
  const [statusMessage, setStatusMessage] = useState(
    '7 jours gratuits. Carte requise. Ensuite 3,49 €/mois.',
  );
  const [statusVariant, setStatusVariant] = useState<StatusVariant>('info');
  const [toastMessage, setToastMessage] = useState(
    'Budgee est prêt pour ton essai gratuit.',
  );
  const [toastVisible, setToastVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileType, setProfileType] = useState('Étudiant');
  const [promoCode, setPromoCode] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSignup = authMode === 'signup';
  const isRecovery = authMode === 'recovery';

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);

    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
    }, 2600);
  }

  function setStatus(message: string, variant: StatusVariant = 'info') {
    setStatusMessage(message);
    setStatusVariant(variant);
  }

  function setAuthMode(mode: AuthMode) {
    setAuthModeState(mode);

    setStatus(
      mode === 'signup'
        ? '7 jours gratuits. Carte requise. Ensuite 3,49 €/mois.'
        : mode === 'recovery'
          ? 'Entre un nouveau mot de passe de 8 caractères minimum.'
          : 'Connecte-toi pour reprendre ton budget.',
      'info',
    );
  }

  async function handleForgotPassword(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus('Entre ton email pour recevoir un lien de réinitialisation.', 'error');
      return;
    }

    const redirectTo = getRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (error) {
      setStatus("Impossible d’envoyer le lien de réinitialisation pour l’instant.", 'error');
      showToast('Réinitialisation impossible');
      return;
    }

    setStatus('Lien de réinitialisation envoyé. Vérifie ton email.', 'success');
    showToast('Email de réinitialisation envoyé');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPromoCode = promoCode.trim();

    if (
      (!normalizedEmail && authMode !== 'recovery') ||
      !password ||
      (authMode === 'signup' && !normalizedName)
    ) {
      setStatus(
        authMode === 'signup'
          ? 'Remplis tous les champs pour créer ton compte.'
          : authMode === 'recovery'
            ? 'Entre ton nouveau mot de passe pour continuer.'
            : 'Entre ton email et ton mot de passe pour te connecter.',
        'error',
      );
      return;
    }

    if ((authMode === 'signup' || authMode === 'recovery') && password.length < 8) {
      setStatus('Ton mot de passe doit contenir au moins 8 caractères.', 'error');
      return;
    }

    setIsSubmitting(true);
    setStatus(
      authMode === 'signup'
        ? 'On prépare ton accès Budgee...'
        : authMode === 'recovery'
          ? 'Mise à jour de ton mot de passe...'
          : 'Connexion à ton espace Budgee...',
      'info',
    );

    const redirectTo = getRedirectUrl();
    let data: any = null;
    let error: Error | null = null;

    if (authMode === 'signup') {
      const response = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            name: normalizedName,
            profile_type: profileType,
          },
        },
      });
      data = response.data;
      error = response.error;
    } else if (authMode === 'recovery') {
      const response = await supabase.auth.updateUser({ password });
      data = response.data;
      error = response.error;
    } else {
      const response = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      data = response.data;
      error = response.error;
    }

    setIsSubmitting(false);

    if (error) {
      const message =
        authMode === 'signup'
          ? error.message.includes('already registered')
            ? 'Cet email a déjà un compte. Passe en mode connexion juste au-dessus.'
            : "Impossible de créer ton compte pour l’instant. Réessaie dans un instant."
          : authMode === 'recovery'
            ? 'Impossible de mettre à jour ton mot de passe.'
            : 'Email ou mot de passe incorrect.';
      setStatus(message, 'error');
      showToast(message);
      return;
    }

    if (
      authMode === 'signup' &&
      data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      const message =
        'Cet email a déjà un compte. Essaie de te connecter depuis l’app Budgee.';
      setStatus(message, 'error');
      showToast(message);
      return;
    }

    if (authMode === 'signup') {
      savePendingSignup({
        email: normalizedEmail,
        fullName: normalizedName,
        profileType,
        promoCode: normalizedPromoCode,
      });

      if (!data?.session) {
        setAuthModeState('login');
        setStatus(
          "Compte créé. Vérifie ton email : après confirmation, Budgee t’enverra vers le paiement sécurisé.",
          'success',
        );
        showToast('Email de confirmation envoyé');
        return;
      }

      try {
        setStatus('Compte créé. Redirection vers le paiement sécurisé...', 'info');
        await launchCheckout({
          userId: data.user?.id ?? '',
          email: normalizedEmail,
          fullName: normalizedName,
          profileType,
          promoCode: normalizedPromoCode,
        });
        clearPendingSignup();
      } catch (checkoutError) {
        setStatus(
          checkoutError instanceof Error
            ? checkoutError.message
            : 'Compte créé, mais le paiement sécurisé est indisponible pour le moment.',
          'error',
        );
        showToast('Paiement indisponible');
      }
      return;
    }

    if (authMode === 'recovery') {
      setName('');
      setEmail('');
      setPassword('');
      setProfileType('Étudiant');
      setPromoCode('');
      setAuthModeState('login');
      setStatus(
        'Mot de passe mis à jour. Tu peux maintenant te connecter avec ton nouveau mot de passe.',
        'success',
      );
      showToast('Mot de passe mis à jour');
      return;
    }

    try {
      const sessionUserId = data?.session?.user?.id ?? '';
      const currentSubscription = await fetchCurrentSubscription(sessionUserId);

      if (hasSubscriptionAccess(currentSubscription)) {
        setStatus(
          'Connexion réussie. Ton accès Budgee est actif, tu peux ouvrir l’app.',
          'success',
        );
        showToast('Accès Budgee actif');
        return;
      }

      const userMetadata =
        (data?.session?.user?.user_metadata as
          | { name?: string; profile_type?: string }
          | undefined) ?? undefined;

      setStatus(
        'Connexion réussie. On te redirige vers le paiement sécurisé pour démarrer ton essai.',
        'info',
      );
      await launchCheckout({
        userId: sessionUserId,
        email: data?.session?.user?.email ?? normalizedEmail,
        fullName: userMetadata?.name ?? '',
        profileType: userMetadata?.profile_type ?? '',
        promoCode: normalizedPromoCode,
      });
    } catch (checkoutError) {
      setStatus(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Connexion réussie, mais le paiement sécurisé est indisponible pour le moment.',
        'error',
      );
      showToast('Paiement indisponible');
    }
  }

  useEffect(() => {
    async function init() {
      const authParams = getAuthParams();
      const searchParams = new URLSearchParams(window.location.search);
      const { data: sessionData } = await supabase.auth.getSession();

      if (searchParams.get('checkout') === 'success') {
        clearPendingSignup();
        setAuthModeState('login');
        setStatus(
          "Paiement enregistré. Si ton email n’est pas encore confirmé, valide-le puis connecte-toi dans l’app Budgee.",
          'success',
        );
        showToast('Essai Budgee activé');
      } else if (searchParams.get('checkout') === 'cancel') {
        setAuthModeState('login');
        setStatus(
          'Paiement annulé. Tu peux relancer le checkout quand tu veux pour démarrer ton essai Budgee.',
          'error',
        );
      } else if (
        authParams.hashType === 'recovery' ||
        authParams.searchType === 'recovery'
      ) {
        setAuthModeState('recovery');
        setStatus(
          'Choisis ton nouveau mot de passe pour récupérer ton compte Budgee.',
          'info',
        );
      } else if (sessionData?.session) {
        setAuthModeState('login');

        try {
          const currentSubscription = await fetchCurrentSubscription(
            sessionData.session.user.id,
          );

          if (hasSubscriptionAccess(currentSubscription)) {
            clearPendingSignup();
            setStatus(
              'Tu es connectée. Ton accès Budgee est actif, tu peux ouvrir l’app.',
              'success',
            );
          } else {
            const pendingSignup = getPendingSignupForEmail(
              sessionData.session.user.email ?? '',
            );
            const shouldAutoCheckout =
              authParams.hasAccessToken ||
              authParams.hasCode ||
              authParams.hashType === 'signup' ||
              authParams.searchType === 'signup' ||
              Boolean(pendingSignup);

            if (shouldAutoCheckout) {
              const userMetadata =
                (sessionData.session.user.user_metadata as
                  | { name?: string; profile_type?: string }
                  | undefined) ?? undefined;

              setStatus('Email confirmé. Redirection vers le paiement sécurisé...', 'info');
              await launchCheckout({
                userId: sessionData.session.user.id,
                email: sessionData.session.user.email ?? '',
                fullName: pendingSignup?.fullName ?? userMetadata?.name ?? '',
                profileType:
                  pendingSignup?.profileType ?? userMetadata?.profile_type ?? '',
                promoCode: pendingSignup?.promoCode ?? '',
              });
              clearPendingSignup();
            } else {
              setStatus(
                'Tu es connectée. Termine le paiement sécurisé pour démarrer ton essai Budgee.',
                'info',
              );
            }
          }
        } catch (subscriptionError) {
          setStatus(
            subscriptionError instanceof Error
              ? subscriptionError.message
              : "On n’a pas réussi à vérifier ton abonnement Budgee.",
            'error',
          );
        }
      } else {
        const hasAuthParams =
          authParams.hasAccessToken ||
          authParams.hasCode ||
          authParams.hashType === 'signup' ||
          authParams.searchType === 'signup';

        if (hasAuthParams) {
          setAuthModeState('login');
          setStatus(
            'Email confirmé. Tu peux maintenant te connecter avec ton compte Budgee.',
            'success',
          );
          showToast('Email confirmé');
        }
      }
    }

    void init();

    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).style.animationPlayState = 'running';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );

    document.querySelectorAll('.fade-up').forEach((element) => {
      (element as HTMLElement).style.animationPlayState = 'paused';
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const authTitle = isSignup
    ? 'Commence ton essai Budgee'
    : isRecovery
      ? 'Choisis un nouveau mot de passe'
      : 'Connecte-toi et retrouve ton budget';

  const authCopy = isSignup
    ? 'Crée ton compte puis démarre ton essai gratuit.'
    : isRecovery
      ? 'Ton lien est bien arrivé. Choisis maintenant un nouveau mot de passe pour récupérer ton compte Budgee.'
      : 'Connecte-toi pour retrouver ton budget.';

  const submitLabel = isSubmitting
    ? isSignup
      ? 'Création du compte...'
      : isRecovery
        ? 'Mise à jour...'
        : 'Connexion...'
    : isSignup
      ? 'Commencer mon essai gratuit'
      : isRecovery
        ? 'Mettre à jour mon mot de passe'
        : 'Je me connecte';
  const showForgotPassword = false;

  return (
    <>
      <div className="bg-glow" />

      <div className="page">
        <nav className="nav fade-up">
          <a href="#" className="brand">
            budgee
          </a>
          <div className="nav-actions">
            <a
              href="https://apps.apple.com/fr/search?term=budgee"
              className="nav-app-link"
              target="_blank"
              rel="noreferrer"
            >
              📱 App iOS
            </a>
            <a href="#inscription" className="nav-cta">
              Commencer mon essai gratuit
              <svg
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 7h12M8 2l5 5-5 5" />
              </svg>
            </a>
          </div>
        </nav>

        <section className="hero">
          <article
            className="card hero-copy fade-up"
            style={{ animationDelay: '0.08s' }}
          >
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              7 jours gratuits — Essai sans risque
            </div>
            <h1 className="hero-h1">
              L&apos;app <span className="hl-blue">budget</span> pour étudiants
              <br />
              qui veulent arrêter d&apos;être <span className="hl-gold">à sec</span>
              <br />
              avant la fin du mois.
            </h1>
            <p className="hero-sub">
              En <strong>moins de 2 minutes par semaine</strong>, tu sais exactement
              combien tu peux encore dépenser jusqu&apos;au bout du mois.
            </p>
            <div className="cta-group">
              <a href="#inscription" className="btn-primary">
                Commencer mon essai gratuit — 7 jours offerts
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 7h12M8 2l5 5-5 5" />
                </svg>
              </a>
              <div className="reassurance-line">
                <span>Carte requise</span>
                <span>Aucun prélèvement avant J+7</span>
                <span>Résiliation en 1 clic</span>
              </div>
            </div>
            <div className="sales-trio">
              <div className="sales-item">
                <strong>Vois où ça part</strong>
                <p>Loyer, courses, sorties.</p>
              </div>
              <div className="sales-item">
                <strong>Sache ce qu&apos;il reste</strong>
                <p>Tu sais ce que tu peux encore dépenser.</p>
              </div>
              <div className="sales-item">
                <strong>3,49 € vite rentabilisés</strong>
                <p>Moins qu&apos;un café par semaine.</p>
              </div>
            </div>
          </article>

          <aside
            className="card hero-phone-card fade-up"
            style={{ animationDelay: '0.18s' }}
            aria-hidden="true"
          >
            <div className="phone-wrap">
              <div className="phone-shell">
                <div className="phone-screen">
                  <div className="screen-inner">
                    <div className="status-bar">
                      <span>21:04</span>
                      <span>5G</span>
                    </div>
                    <div className="app-greeting">
                      <div className="app-greeting-text">
                        <h2>Bonjour, Emma</h2>
                        <p>Lundi 13 janvier 2025</p>
                      </div>
                      <div className="avatar">EM</div>
                    </div>
                    <div className="budget-card">
                      <div className="budget-header">
                        <div>
                          <div className="budget-label">Budget restant</div>
                          <div className="budget-amount">
                            361<sup>€</sup>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="days-pill">18 jours restants</div>
                          <div className="budget-meta">
                            sur <strong>950 €</strong> fixés
                          </div>
                        </div>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" />
                      </div>
                      <div className="budget-row">
                        <span>
                          <strong>589 €</strong> dépensés
                        </span>
                        <span>
                          <strong>62%</strong> utilisé
                        </span>
                      </div>
                    </div>
                    <div className="cat-grid">
                      <div className="cat-card">
                        <div className="cat-dot" />
                        <div className="cat-icon" style={{ background: '#fdf2e2' }}>
                          🛒
                        </div>
                        <div className="cat-name">Courses</div>
                        <div className="cat-value">88 €</div>
                        <div className="cat-sub">sur 100 €</div>
                      </div>
                      <div className="cat-card">
                        <div className="cat-icon" style={{ background: '#eeeaff' }}>
                          🎮
                        </div>
                        <div className="cat-name">Loisirs</div>
                        <div className="cat-value">51 €</div>
                        <div className="cat-sub">sur 150 €</div>
                      </div>
                      <div className="cat-card">
                        <div className="cat-icon" style={{ background: '#e6eefa' }}>
                          🏠
                        </div>
                        <div className="cat-name">Loyer</div>
                        <div className="cat-value">450 €</div>
                        <div className="cat-sub">fixe</div>
                      </div>
                      <div className="cat-card">
                        <div className="cat-dot red" />
                        <div className="cat-icon" style={{ background: '#fce8e8' }}>
                          📦
                        </div>
                        <div className="cat-name">Divers</div>
                        <div className="cat-value red">−7 €</div>
                        <div className="cat-sub">dépassé</div>
                      </div>
                    </div>
                    <div className="savings-card">
                      <div className="savings-header">
                        <span className="savings-title">Épargne</span>
                        <span>✈️</span>
                      </div>
                      <div className="savings-name">Vacances Barcelone</div>
                      <div className="savings-pct">60%</div>
                      <div className="savings-amount">60 € versés ce mois</div>
                      <div className="savings-bar">
                        <div className="savings-fill" />
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#555',
                        marginBottom: '6px',
                      }}
                    >
                      Historique
                    </div>
                    <div className="history-list">
                      <div className="history-item">
                        <div
                          className="history-ico"
                          style={{ background: '#fdf2e2' }}
                        >
                          🍕
                        </div>
                        <div className="history-info">
                          <div className="history-name">Domino&apos;s Pizza</div>
                          <div className="history-meta">Loisirs · carte</div>
                        </div>
                        <div className="history-amt">−18 €</div>
                      </div>
                      <div className="history-item">
                        <div
                          className="history-ico"
                          style={{ background: '#e8f5e9' }}
                        >
                          🛒
                        </div>
                        <div className="history-info">
                          <div className="history-name">Carrefour Market</div>
                          <div className="history-meta">Courses · carte</div>
                        </div>
                        <div className="history-amt">−34 €</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="card fade-up">
          <div className="section-kicker">Le problème</div>
          <h3 className="section-h">Tu te reconnais ?</h3>
          <p className="section-sub">Le problème, c&apos;est le manque de visibilité.</p>
          <div className="problem-grid">
            <div className="pain-list">
              <div className="pain-bubble">
                Tu regardes ton compte sans comprendre où ton argent est passé
              </div>
              <div className="pain-bubble">
                Tu dépenses un peu chaque jour… et à la fin du mois tu es à sec
              </div>
              <div className="pain-bubble">
                Tu veux économiser, mais tu ne sais jamais combien tu peux vraiment
                dépenser
              </div>
            </div>
            <div className="gain-box">
              <h4>Quand tu vois mieux, tu gères mieux.</h4>
              <div className="gain-list">
                <div className="gain-bubble">Plus de clarté</div>
                <div className="gain-bubble">Moins de stress</div>
                <div className="gain-bubble">De meilleures décisions</div>
              </div>
            </div>
          </div>
          <p className="transition-line">
            Quand tu vois mieux, tu gères mieux. Budgee te donne cette visibilité en
            2 minutes.
          </p>
        </section>

        <section className="card fade-up">
          <div className="section-kicker">La solution</div>
          <h3 className="section-h">Budgee te simplifie la vie</h3>
          <p className="section-sub">
            Pas de tableaux compliqués. Pas de jargon. Juste ce qu&apos;il faut pour
            piloter ton mois.
          </p>
          <div className="features-grid">
            {[
              {
                icon: '👀',
                title: 'Vois où part ton argent',
                desc: 'Tu vois vite ce qui pèse dans ton budget.',
              },
              {
                icon: '💳',
                title: 'Sache combien il te reste',
                desc: 'Tu sais exactement ce que tu peux encore dépenser.',
              },
              {
                icon: '⚠️',
                title: 'Anticipe les dépassements',
                desc: 'Tu repères les écarts avant la fin du mois.',
              },
              {
                icon: '🌱',
                title: 'Mets de côté facilement',
                desc: 'Même avec un petit budget, tu gardes une marge.',
              },
            ].map((feature) => (
              <div className="feature-item" key={feature.title}>
                <div className="feature-icon">{feature.icon}</div>
                <strong>{feature.title}</strong>
                <p>{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card fade-up">
          <div className="section-kicker">Témoignages</div>
          <h3 className="section-h">Ils voient enfin clair dans leur mois</h3>
          <div className="testimonials-count">+2 300 étudiants ont rejoint Budgee</div>
          <div className="testimonials-grid">
            {[
              {
                quote:
                  '"Je savais plus du tout où passait mon argent. Là je vois tout d\'un coup d\'œil."',
                author: '— Lucas, étudiant en M1',
              },
              {
                quote:
                  '"En 3 jours j\'avais déjà compris pourquoi j\'étais toujours à découvert."',
                author: '— Inès, alternante en BTS',
              },
              {
                quote:
                  '"3,49 € par mois c\'est littéralement rien comparé à ce que je gaspillais."',
                author: '— Tom, étudiant en L2',
              },
            ].map((testimonial) => (
              <div className="testimonial-card" key={testimonial.author}>
                <div className="stars">★★★★★</div>
                <blockquote>{testimonial.quote}</blockquote>
                <div className="testimonial-meta">{testimonial.author}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card fade-up">
          <div className="section-kicker">Le prix</div>
          <h3 className="section-h">Un prix fait pour les étudiants</h3>
          <p className="section-sub">Simple, clair, sans surprise.</p>
          <div className="pricing-grid">
            <div className="price-side">
              <div className="price-main">
                <div className="price-big">
                  3,49 <span>€ / mois</span>
                </div>
                <p className="price-tagline">Moins qu&apos;un café par semaine.</p>
              </div>
              <ul className="guarantees">
                <li>7 jours gratuits pour tester</li>
                <li>Sans engagement</li>
                <li>Résiliation en 1 clic depuis l&apos;app</li>
                <li>Tes données sont sécurisées</li>
              </ul>
              <div className="pricing-disclaimer">
                Après tes 7 jours gratuits, tu seras prélevé de 3,49 €
                automatiquement. Tu peux résilier à tout moment en 1 clic.
              </div>
            </div>
          </div>
        </section>

        <section className="card" id="inscription">
          <div className="signup-tabs">
            <button
              type="button"
              className={`tab-btn${isSignup ? ' active' : ''}`}
              onClick={() => setAuthMode('signup')}
            >
              S&apos;inscrire
            </button>
            <button
              type="button"
              className={`tab-btn${!isSignup ? ' active' : ''}`}
              onClick={() => setAuthMode('login')}
            >
              Se connecter
            </button>
          </div>
          <div className="trial-badge">⏱ 7 jours gratuits pour tester</div>
          <h3 className="signup-form-h">{authTitle}</h3>
          <p className="signup-form-sub">{authCopy}</p>
          <div className="form-divider" />
          <form className="form-body" id="signup-form" onSubmit={handleSubmit}>
            <div className="step-block">
              <div className="step-title">
                <div className="step-num">1</div>
                <div className="step-title-text">
                  <strong>Ton compte</strong>
                  <p>On commence par les bases.</p>
                </div>
              </div>
              <div className="field-group">
                <div id="name-wrap" className={!isSignup ? 'hidden-field' : ''}>
                  <label className="field-label" htmlFor="f-name">
                    Prénom et nom
                  </label>
                  <input
                    className="field"
                    id="f-name"
                    type="text"
                    placeholder="Ex : Emma Martin"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required={isSignup}
                  />
                </div>
                <div className={isRecovery ? 'hidden-field' : ''}>
                  <label className="field-label" htmlFor="f-email">
                    Email
                  </label>
                  <input
                    className="field"
                    id="f-email"
                    type="email"
                    placeholder="emma@univ.fr"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required={!isRecovery}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-pwd">
                    Mot de passe
                  </label>
                  <input
                    className="field"
                    id="f-pwd"
                    type="password"
                    placeholder="8 caractères minimum"
                    autoComplete={
                      isSignup || isRecovery ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div id="profile-wrap" className={!isSignup ? 'hidden-field' : ''}>
                  <label className="field-label">Ton profil</label>
                  <div className="profile-btns">
                    {['Étudiant', 'Alternant', 'Jeune actif'].map((profile) => (
                      <button
                        key={profile}
                        type="button"
                        className={`profile-btn${
                          profileType === profile ? ' active' : ''
                        }`}
                        onClick={() => setProfileType(profile)}
                      >
                        {profile}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {isSignup && (
              <div className="step-block">
                <div className="step-title">
                  <div className="step-num">2</div>
                  <div className="step-title-text">
                    <strong>Ton essai gratuit</strong>
                    <p>
                      Ajoute ta carte et, si tu en as un, ton code BDE ou parrain.
                    </p>
                  </div>
                </div>
                <div className="stripe-block">
                  <div className="stripe-header">
                    <span className="stripe-title">Carte bancaire (Stripe)</span>
                    <span className="stripe-logos" aria-label="Visa et Mastercard">
                      <span className="card-logo visa-logo" aria-hidden="true">
                        <span className="visa-logo-text">VISA</span>
                      </span>
                      <span className="card-logo mastercard-logo" aria-hidden="true">
                        <span className="mastercard-circle mastercard-left" />
                        <span className="mastercard-circle mastercard-right" />
                      </span>
                    </span>
                  </div>
                  <p>
                    Ta carte est renseignée sur la page sécurisée Stripe après
                    validation.
                  </p>
                </div>
                <label className="field-label" htmlFor="f-promo">
                  Code BDE ou parrain
                </label>
                <input
                  className="field"
                  id="f-promo"
                  type="text"
                  placeholder="Ex : BUDGEE14"
                  autoComplete="off"
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value)}
                />
                <p className="promo-note">
                  Un code valide t&apos;offre 7 jours supplémentaires gratuits, soit
                  14 jours au total.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="submit-btn"
              disabled={isSubmitting}
              style={{ opacity: isSubmitting ? 0.7 : 1 }}
            >
              {submitLabel}
            </button>
          </form>

          <p className="secure-line">
            <span className="secure-line-top">
              <span>🔒 Paiement sécurisé par Stripe</span>
              <span className="stripe-logos" aria-label="Visa et Mastercard">
                <span className="card-logo visa-logo" aria-hidden="true">
                  <span className="visa-logo-text">VISA</span>
                </span>
                <span className="card-logo mastercard-logo" aria-hidden="true">
                  <span className="mastercard-circle mastercard-left" />
                  <span className="mastercard-circle mastercard-right" />
                </span>
              </span>
            </span>
            <br />
            Aucun prélèvement pendant 7 jours. Résiliation en 1 clic.
          </p>

          {showForgotPassword && !isRecovery && (
            <a
              href="#"
              className="minor-link"
              onClick={handleForgotPassword}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '10px',
                color: 'var(--blue)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 700,
              }}
            >
              Mot de passe oublié ?
            </a>
          )}

          <div
            className="status-box"
            style={{
              background:
                statusVariant === 'error'
                  ? '#fde8e3'
                  : statusVariant === 'success'
                    ? '#e4f5ee'
                    : 'var(--blue-soft)',
              color:
                statusVariant === 'error'
                  ? '#7a3020'
                  : statusVariant === 'success'
                    ? '#1e7a52'
                    : 'var(--blue)',
            }}
          >
            {statusMessage}
          </div>
        </section>

        <footer className="card footer">
          <div className="footer-left">
            <h3>Budgee est prêt pour ton essai gratuit.</h3>
            <p>Commence sur le site, puis retrouve ton budget dans l&apos;app.</p>
          </div>
          <div className="footer-links">
            <a href="/cgu">CGU</a>
            <a href="/confidentialite">Politique de confidentialité</a>
            <a href="mailto:contact@budgee.app">Contact</a>
          </div>
        </footer>
      </div>

      <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMessage}</div>
    </>
  );
}
