'use client';

// MIGRATED FROM: index.html
import { createClient } from '@supabase/supabase-js';
import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;
const pendingSignupStorageKey = 'budgee-pending-signup';

type AuthMode = 'signup' | 'login' | 'recovery';
type StatusVariant = 'info' | 'success' | 'error';
type LandingClientVariant = 'full' | 'login' | 'password';

type PendingSignup = {
  email: string;
  fullName: string;
  profileType: string;
};

type LandingClientProps = {
  variant?: LandingClientVariant;
};

function getFriendlyAuthErrorMessage(error: Error & { code?: string; status?: number }, mode: AuthMode) {
  const rawMessage = error.message.toLowerCase();

  if (mode === 'signup') {
    if (rawMessage.includes('already registered')) {
      return 'Cet email a deja un compte. Passe en mode connexion juste au-dessus.';
    }

    if (
      error.code === 'over_email_send_rate_limit' ||
      error.status === 429 ||
      rawMessage.includes('email rate limit exceeded')
    ) {
      return "Trop d'emails de confirmation ont ete envoyes pour l'instant. Attends un peu puis reessaie.";
    }

    if (error.code === 'email_address_invalid' || rawMessage.includes('email address') && rawMessage.includes('invalid')) {
      return 'Cet email n est pas valide. Verifie son orthographe puis reessaie.';
    }

    return error.message.trim() || "Impossible de creer ton compte pour l'instant. Reessaie dans un instant.";
  }

  if (mode === 'recovery') {
    if (
      error.code === 'over_email_send_rate_limit' ||
      error.status === 429 ||
      rawMessage.includes('email rate limit exceeded')
    ) {
      return "Trop d'emails ont ete demandes pour l'instant. Attends un peu puis reessaie.";
    }

    return error.message.trim() || 'Impossible de mettre a jour ton mot de passe.';
  }

  return error.message.trim() || 'Email ou mot de passe incorrect.';
}

function hasSubscriptionAccess(
  subscription:
    | {
        status: string;
        trial_ends_at: string | null;
        current_period_end_at: string | null;
      }
    | null
    | undefined,
) {
  if (!subscription) {

    return false;
  }

  const now = Date.now();
  let result = false;

  if (subscription.status === 'trialing') {
    if (!subscription.trial_ends_at) {
      result = true;
    } else {
      const expirationDate = new Date(subscription.trial_ends_at).getTime();
      result = expirationDate > now;

    }
  } else if (subscription.status === 'active') {
    result = true;
  } else if (
    (subscription.status === 'past_due' || subscription.status === 'canceled') &&
    subscription.current_period_end_at
  ) {
    const expirationDate = new Date(subscription.current_period_end_at).getTime();
    result = expirationDate > now;

  }


  return result;
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

async function launchCheckout({
  accessToken,
  userId,
  email,
  fullName,
  profileType,
  returnPath = '/',
}: {
  accessToken?: string;
  userId: string;
  email: string;
  fullName: string;
  profileType: string;
  returnPath?: string;
}) {
  const headers = await getAuthorizedJsonHeaders(accessToken);
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userId,
      email,
      fullName,
      profileType,
      returnPath,
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

async function confirmCheckoutSession(sessionId: string, accessToken?: string) {
  const headers = await getAuthorizedJsonHeaders(accessToken);
  const response = await fetch('/api/stripe/confirm-checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || 'Le paiement est revenu, mais Kloo n’a pas encore confirmé ton essai.',
    );
  }

  return payload;
}

async function syncStripeAccess({
  accessToken,
  userId,
  email,
}: {
  accessToken?: string;
  userId: string;
  email: string;
}) {
  const headers = await getAuthorizedJsonHeaders(accessToken);
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
      payload.error || 'Impossible de vérifier ton essai Kloo pour le moment.',
    );
  }

  return payload.subscription ?? null;
}

async function getAuthorizedJsonHeaders(explicitAccessToken?: string) {
  const accessToken =
    explicitAccessToken ??
    (await getSupabaseClient().auth.getSession()).data.session?.access_token?.trim();

  if (!accessToken) {
    throw new Error('Reconnecte-toi à Kloo pour continuer en sécurité.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
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

function buildPageUrl(pathname: string) {
  return `${window.location.origin}${pathname}`;
}

function getSignupRedirectUrl() {
  return buildPageUrl('/connexion');
}

function getRecoveryRedirectUrl() {
  return buildPageUrl('/mot-de-passe');
}

function getPaymentPageUrl() {
  return buildPageUrl('/paiement');
}

function getCurrentUrlWithAuthParams(pathname: string) {
  return `${buildPageUrl(pathname)}${window.location.search}${window.location.hash}`;
}

function getDefaultAuthMode(variant: LandingClientVariant): AuthMode {
  if (variant === 'password') {
    return 'recovery';
  }

  if (variant === 'login') {
    return 'login';
  }

  return 'signup';
}

function getStatusMessageForMode(mode: AuthMode) {
  if (mode === 'recovery') {
    return 'Entre un nouveau mot de passe de 8 caractères minimum.';
  }

  if (mode === 'login') {
    return 'Connecte-toi pour ouvrir Kloo et reprendre ton budget.';
  }

  return '7 jours d’essai avec paiement sécurisé. Résiliation en 1 clic.';
}

function isRecoveryAuthParams(authParams: ReturnType<typeof getAuthParams>) {
  return authParams.hashType === 'recovery' || authParams.searchType === 'recovery';
}

function hasLoginAuthParams(authParams: ReturnType<typeof getAuthParams>) {
  return (
    authParams.hasAccessToken ||
    authParams.hasCode ||
    authParams.hashType === 'signup' ||
    authParams.searchType === 'signup' ||
    authParams.hashType === 'email' ||
    authParams.searchType === 'email'
  );
}

function getAuthRedirectPath(authParams: ReturnType<typeof getAuthParams>) {
  if (isRecoveryAuthParams(authParams)) {
    return '/mot-de-passe';
  }

  if (hasLoginAuthParams(authParams)) {
    return '/connexion';
  }

  return null;
}

function savePendingSignup(payload: PendingSignup) {
  try {
    localStorage.setItem(pendingSignupStorageKey, JSON.stringify(payload));
  } catch (storageError) {
    console.warn('Impossible de mémoriser le signup Kloo.', storageError);
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
    console.warn('Impossible de lire le signup Kloo en attente.', storageError);
    return null;
  }
}

function clearPendingSignup() {
  try {
    localStorage.removeItem(pendingSignupStorageKey);
  } catch (storageError) {
    console.warn('Impossible de nettoyer le signup Kloo en attente.', storageError);
  }
}

function getPendingSignupForEmail(email: string) {
  const pendingSignup = readPendingSignup();
  if (!pendingSignup || !email) {
    return null;
  }

  return pendingSignup.email === email.toLowerCase() ? pendingSignup : null;
}

export default function LandingClient({
  variant = 'full',
}: LandingClientProps) {
  const defaultAuthMode = getDefaultAuthMode(variant);
  const isSupabaseConfigured = Boolean(supabase);
  const [authMode, setAuthModeState] = useState<AuthMode>(defaultAuthMode);
  const [statusMessage, setStatusMessage] = useState(
    getStatusMessageForMode(defaultAuthMode),
  );
  const [statusVariant, setStatusVariant] = useState<StatusVariant>('info');
  const [toastMessage, setToastMessage] = useState(
    'Kloo est prêt pour ton essai gratuit.',
  );
  const [toastVisible, setToastVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAppActions, setShowAppActions] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileType, setProfileType] = useState('Étudiant');
  const [showPassword, setShowPassword] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSignup = authMode === 'signup';
  const isRecovery = authMode === 'recovery';
  const isFullLanding = variant === 'full';
  const isLoginOnly = variant === 'login';
  const isPasswordOnly = variant === 'password';

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

  function scrollToAuthSection() {
    document.getElementById('inscription')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function scrollToInstallSection() {
    document.getElementById('guide-app')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function openBudgeeApp() {
    window.location.assign('/app');
  }

  function redirectToBudgeeApp(delay = 250) {
    window.setTimeout(() => {
      openBudgeeApp();
    }, delay);
  }

  function openSignupSection(event?: MouseEvent<HTMLAnchorElement>) {
    event?.preventDefault();
    setAuthMode('signup');
    scrollToAuthSection();
  }

  function openLoginSection(event?: MouseEvent<HTMLAnchorElement>) {
    event?.preventDefault();
    setAuthMode('login');
    scrollToAuthSection();
  }

  function setAuthMode(mode: AuthMode) {
    setAuthModeState(mode);
    setShowAppActions(false);
    setStatus(getStatusMessageForMode(mode), 'info');
  }

  async function handleForgotPassword(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus('Entre ton email pour recevoir un lien de réinitialisation.', 'error');
      return;
    }

    const redirectTo = getRecoveryRedirectUrl();
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo,
      },
    );

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
        ? 'On prépare ton accès Kloo...'
        : authMode === 'recovery'
          ? 'Mise à jour de ton mot de passe...'
          : 'Connexion à ton espace Kloo...',
      'info',
    );

    let data: any = null;
    let error: Error | null = null;

    if (authMode === 'signup') {
      const response = await getSupabaseClient().auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: getSignupRedirectUrl(),
          data: {
            name: normalizedName,
            profile_type: profileType,
          },
        },
      });
      data = response.data;
      error = response.error;
    } else if (authMode === 'recovery') {
      const response = await getSupabaseClient().auth.updateUser({ password });
      data = response.data;
      error = response.error;
    } else {
      const response = await getSupabaseClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      data = response.data;
      error = response.error;
    }

    setIsSubmitting(false);

    if (error) {
      console.error('Erreur auth Supabase', error);
      const message = getFriendlyAuthErrorMessage(error, authMode);
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
        'Cet email a déjà un compte. Essaie de te connecter depuis l’app Kloo.';
      setStatus(message, 'error');
      showToast(message);
      return;
    }

    if (authMode === 'signup') {
      savePendingSignup({
        email: normalizedEmail,
        fullName: normalizedName,
        profileType,
      });

      if (!data?.session) {
        setAuthModeState('login');
        setShowAppActions(false);
        setStatus(
          'Compte créé. Vérifie ton email : après confirmation, tu pourras lancer ton essai de 7 jours.',
          'success',
        );
        showToast('Email de confirmation envoyé');
        return;
      }

      try {
        setStatus('Compte créé. On t’ouvre le checkout sécurisé pour démarrer ton essai...', 'info');
        await launchCheckout({
          accessToken: data.session?.access_token,
          userId: data.user?.id ?? '',
          email: data.user?.email ?? normalizedEmail,
          fullName: normalizedName,
          profileType,
        });
      } catch (checkoutError) {
        setStatus(
          checkoutError instanceof Error
            ? checkoutError.message
            : 'Compte créé, mais le checkout sécurisé n’a pas pu être lancé automatiquement.',
          'error',
        );
        showToast('Checkout indisponible');
      }
      return;
    }

    if (authMode === 'recovery') {
      setName('');
      setEmail('');
      setPassword('');
      setProfileType('Étudiant');
      setShowAppActions(false);

      try {
        await getSupabaseClient().auth.signOut();
      } catch (signOutError) {
        console.warn('Déconnexion après changement de mot de passe impossible.', signOutError);
      }

      window.location.assign('/connexion?password=updated');
      return;
    }

    try {
      const sessionUserId = data?.session?.user?.id ?? '';
      let currentSubscription = await fetchCurrentSubscription(sessionUserId);
      const hadSubscriptionBefore = currentSubscription !== null;
      const userMetadata =
        (data?.session?.user?.user_metadata as
          | { name?: string; profile_type?: string }
          | undefined) ?? undefined;

      if (!hasSubscriptionAccess(currentSubscription) && sessionUserId) {
        currentSubscription = await syncStripeAccess({
          accessToken: data?.session?.access_token,
          userId: sessionUserId,
          email: data?.session?.user?.email ?? normalizedEmail,
        });
      }

      if (hasSubscriptionAccess(currentSubscription)) {
        setShowAppActions(true);
        setStatus(
          'Connexion réussie. Ton accès Kloo est actif, on t’ouvre ton app.',
          'success',
        );
        showToast('Accès Kloo actif');
        redirectToBudgeeApp();
        return;
      }

      if (!hadSubscriptionBefore && !currentSubscription) {
        setStatus(
          'Connexion réussie. On t’ouvre le checkout sécurisé pour démarrer ton essai de 7 jours...',
          'info',
        );
        await launchCheckout({
          accessToken: data.session?.access_token,
          userId: sessionUserId,
          email: data?.session?.user?.email ?? normalizedEmail,
          fullName: userMetadata?.name ?? '',
          profileType: userMetadata?.profile_type ?? '',
        });
        return;
      }

      setStatus(
        'Ton essai est terminé. On t’ouvre la page paiement pour continuer.',
        'info',
      );
      window.location.assign(getPaymentPageUrl());
      return;
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Action impossible pour le moment.',
        'error',
      );
      showToast('Erreur de connexion');
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return () => {
        if (toastTimer.current) {
          clearTimeout(toastTimer.current);
        }
      };
    }

    async function init() {
      const authParams = getAuthParams();
      const searchParams = new URLSearchParams(window.location.search);
      const authRedirectPath = getAuthRedirectPath(authParams);
      const checkoutSessionId = searchParams.get('session_id');

      if (
        isFullLanding &&
        authRedirectPath &&
        searchParams.get('checkout') !== 'success' &&
        searchParams.get('checkout') !== 'cancel'
      ) {
        window.location.replace(getCurrentUrlWithAuthParams(authRedirectPath));
        return;
      }

      const { data: sessionData } = await getSupabaseClient().auth.getSession();

      if (searchParams.get('password') === 'updated') {
        setAuthModeState('login');
        setShowAppActions(false);
        setStatus(
          'Mot de passe mis à jour. Tu peux maintenant te connecter avec ton nouveau mot de passe.',
          'success',
        );
      }

      if (searchParams.get('checkout') === 'success') {
        let checkoutConfirmed = false;
        let checkoutConfirmationError: Error | null = null;

        if (checkoutSessionId && sessionData.session?.access_token) {
          try {
            await confirmCheckoutSession(
              checkoutSessionId,
              sessionData.session.access_token,
            );
            checkoutConfirmed = true;
          } catch (error) {
            checkoutConfirmationError =
              error instanceof Error
                ? error
                : new Error(
                    'Le paiement est revenu, mais Kloo n’a pas encore confirmé ton essai.',
                  );
          }
        }

        clearPendingSignup();
        setAuthModeState('login');

        if (checkoutConfirmed) {
          setShowAppActions(true);
          setStatus(
            'Paiement enregistré. Kloo est prêt, on t’ouvre ton app.',
            'success',
          );
          showToast('Essai Kloo activé');
          redirectToBudgeeApp();
        } else if (checkoutConfirmationError) {
          setShowAppActions(false);
          setStatus(checkoutConfirmationError.message, 'info');
          showToast('Paiement à confirmer');
        } else {
          setShowAppActions(false);
          setStatus(
            'Paiement revenu. Connecte-toi juste après pour ouvrir ton accès Kloo.',
            'info',
          );
          showToast('Paiement à confirmer');
        }

        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (searchParams.get('checkout') === 'cancel') {
        setAuthModeState('login');
        setShowAppActions(false);
        setStatus(
          'Paiement annulé. Tu peux relancer le checkout quand tu veux pour démarrer ton essai Kloo.',
          'error',
        );
      } else if (isRecoveryAuthParams(authParams)) {
        setAuthModeState('recovery');
        setStatus(
          'Choisis ton nouveau mot de passe pour récupérer ton compte Kloo.',
          'info',
        );
      } else if (sessionData?.session) {
        setAuthModeState('login');

        try {
          let currentSubscription = await fetchCurrentSubscription(
            sessionData.session.user.id,
          );

          if (
            !hasSubscriptionAccess(currentSubscription) &&
            sessionData.session.user.id
          ) {
            currentSubscription = await syncStripeAccess({
              accessToken: sessionData.session.access_token,
              userId: sessionData.session.user.id,
              email: sessionData.session.user.email ?? '',
            });
          }

          // On vérifie si on vient d'une confirmation d'email (via URL ou localStorage)
          const pendingSignupData = getPendingSignupForEmail(
            sessionData.session.user.email ?? '',
          );
          const isConfirmingEmail =
            hasLoginAuthParams(authParams) ||
            Boolean(pendingSignupData);

          if (hasSubscriptionAccess(currentSubscription)) {
            clearPendingSignup();
            setShowAppActions(true);
            setStatus(
              'Tu es connectée. Ton accès Kloo est actif, on t’ouvre ton app.',
              'success',
            );
            redirectToBudgeeApp(isConfirmingEmail ? 400 : 200);

            if (isConfirmingEmail) {
              showToast('Bienvenue sur Kloo !');
            }
          } else {
            if (isConfirmingEmail && !currentSubscription) {
              setStatus(
                'Email confirmé. On t’ouvre le checkout sécurisé pour démarrer ton essai de 7 jours...',
                'info',
              );
              const userMetadata =
                (sessionData.session.user.user_metadata as
                  | { name?: string; profile_type?: string }
                  | undefined) ?? undefined;
              await launchCheckout({
                accessToken: sessionData.session.access_token,
                userId: sessionData.session.user.id,
                email: sessionData.session.user.email ?? '',
                fullName: userMetadata?.name ?? pendingSignupData?.fullName ?? '',
                profileType:
                  userMetadata?.profile_type ?? pendingSignupData?.profileType ?? '',
              });
              return;
            } else {
              setShowAppActions(false);
              setStatus(
                'Tu es connectée. Ton essai est terminé, on t’ouvre la page paiement pour continuer avec Kloo.',
                'info',
              );
              window.location.replace(getPaymentPageUrl());
              return;
            }
          }
        } catch (subscriptionError) {
          setStatus(
            subscriptionError instanceof Error
              ? subscriptionError.message
              : "On n’a pas réussi à vérifier ton abonnement Kloo.",
            'error',
          );
        }
      } else {
        if (hasLoginAuthParams(authParams)) {
          setAuthModeState('login');
          setShowAppActions(false);
          setStatus(
            'Email confirmé. Tu peux maintenant te connecter avec ton compte Kloo.',
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

  const authTitle = isSignup
    ? 'Commence ton essai Kloo'
    : isRecovery
      ? 'Choisis un nouveau mot de passe'
      : 'Connecte-toi et retrouve ton budget';

  const authCopy = isSignup
    ? 'Crée ton compte puis démarre ton essai gratuit.'
    : isRecovery
      ? 'Ton lien est bien arrivé. Choisis maintenant un nouveau mot de passe pour récupérer ton compte Kloo.'
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
  const showForgotPassword = authMode === 'login';
  const authPageTitle = isPasswordOnly
    ? 'Choisis un nouveau mot de passe'
    : 'Connecte-toi à Kloo';
  const authPageCopy = isPasswordOnly
    ? 'Tu es sur la page dédiée à la mise à jour du mot de passe. Après validation, on te renvoie vers la connexion.'
    : 'Cette page sert uniquement à la connexion. Une fois validée, Kloo t’ouvre directement la vraie app.';
  const authCard = (
    <section className="card" id="inscription">
      {isFullLanding ? (
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
      ) : (
        <div className="section-kicker">
          {isPasswordOnly ? 'Mot de passe' : 'Connexion'}
        </div>
      )}
      {isFullLanding && <div className="trial-badge">⏱ 7 jours gratuits pour tester</div>}
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
            <div style={{ position: 'relative' }}>
              <label className="field-label" htmlFor="f-pwd">
                Mot de passe
              </label>
              <input
                className="field"
                id="f-pwd"
                type={showPassword ? 'text' : 'password'}
                placeholder="8 caractères minimum"
                style={{ paddingRight: '45px' }}
                autoComplete={
                  isSignup || isRecovery ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  bottom: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.5,
                }}
                aria-label={showPassword ? 'Masquer' : 'Afficher'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
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
                  Ton essai gratuit démarre après validation du paiement sécurisé.
                </p>
              </div>
            </div>
            <div className="stripe-block">
              <div className="stripe-header">
                <span className="stripe-title">Paiement mensuel sécurisé</span>
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
                Si tu continues après la période d’essai, le paiement se fera plus tard sur la page sécurisée.
              </p>
            </div>
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
          <span>🔒 Paiement sécurisé</span>
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
          Modifier / réinitialiser mon mot de passe
        </a>
      )}

      {isLoginOnly && (
        <a
          href="/"
          className="minor-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          Je n&apos;ai pas encore de compte
        </a>
      )}

      {isPasswordOnly && (
        <a
          href="/connexion"
          className="minor-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          Retour à la connexion
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

      {showAppActions && (
        <div className="action-row">
          <button type="button" className="action-btn" onClick={openBudgeeApp}>
            Ouvrir Kloo
          </button>
          <a
            href={isFullLanding ? '#guide-app' : '/#guide-app'}
            className="action-btn action-btn-secondary"
            onClick={(event) => {
              if (!isFullLanding) {
                return;
              }

              event.preventDefault();
              scrollToInstallSection();
            }}
          >
            Guide d’installation
          </a>
        </div>
      )}
    </section>
  );

  if (!isSupabaseConfigured) {
    return (
      <>
        <div className="bg-glow" />
        <div className="page">
          <section className="card">
            <div className="section-kicker">Configuration</div>
            <h1 className="section-h">Kloo web n’est pas encore configuré</h1>
            <p className="section-sub">
              Ajoute <code>NEXT_PUBLIC_SUPABASE_URL</code> et{' '}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> dans les variables
              d’environnement du déploiement pour activer l’inscription et la
              connexion.
            </p>
          </section>
        </div>
      </>
    );
  }

  if (!isFullLanding) {
    return (
      <>
        <div className="bg-glow" />
        <div className="page auth-page">
          <nav className="nav fade-up">
            <a href="/" className="brand">
              kloo
            </a>
            <div className="nav-actions">
              <a
                href={isPasswordOnly ? '/connexion' : '/'}
                className="nav-app-link"
              >
                {isPasswordOnly ? 'Retour à la connexion' : 'Créer mon compte'}
              </a>
            </div>
          </nav>

          <section className="auth-shell">
            <article className="card auth-copy-card fade-up">
              <div className="section-kicker">
                {isPasswordOnly ? 'Lien sécurisé' : 'Accès rapide'}
              </div>
              <h1 className="section-h">{authPageTitle}</h1>
              <p className="section-sub">{authPageCopy}</p>
              <p className="auth-copy-note">
                {isPasswordOnly
                  ? 'Tu n’as plus besoin de repasser par toute la page de présentation pour mettre à jour ton accès.'
                  : 'Tu n’as plus besoin de repasser par toute la landing page pour entrer dans ton compte.'}
              </p>
            </article>

            <div className="fade-up" style={{ animationDelay: '0.08s' }}>
              {authCard}
            </div>
          </section>
        </div>

        <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMessage}</div>
      </>
    );
  }

  return (
    <>
      <div className="bg-glow" />

      <div className="page">
        <nav className="nav fade-up">
          <a href="#" className="brand">
            kloo
          </a>
          <div className="nav-actions">
            <a href="/connexion" className="nav-app-link">
              Se connecter
            </a>
            <a href="#inscription" className="nav-cta" onClick={openSignupSection}>
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
              <a href="#inscription" className="btn-primary" onClick={openSignupSection}>
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
                <span>7 jours pour tester</span>
                <span>Paiement sécurisé</span>
                <span>Paiement seulement si tu continues</span>
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
                <strong>1,99 € vite rentabilisés</strong>
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
            Quand tu vois mieux, tu gères mieux. Kloo te donne cette visibilité en
            2 minutes.
          </p>
        </section>

        <section className="card fade-up">
          <div className="section-kicker">La solution</div>
          <h3 className="section-h">Kloo te simplifie la vie</h3>
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
          <div className="section-kicker">PWA</div>
          <h3 className="section-h" id="guide-app">
            Ouvre Kloo puis installe l&apos;app sur ton écran d&apos;accueil
          </h3>
          <p className="section-sub">
            La landing te sert à créer ton compte et te connecter. Une fois ton
            accès actif, on t&apos;ouvre la vraie app Kloo sur <code>/app</code>,
            et c&apos;est depuis cette app que tu peux l&apos;installer comme une PWA.
          </p>
          <div className="install-banner">
            <strong>
              Après connexion, Kloo t&apos;ouvre directement l&apos;app sur le même
              domaine.
            </strong>
            <p>
              Si tu veux la garder comme une vraie app, ajoute ensuite cette page
              <code>/app</code> à ton écran d&apos;accueil.
            </p>
          </div>
          <div className="install-grid">
            <article className="install-card">
              <span className="install-device-badge">iPhone / iPad</span>
              <ol className="install-steps">
                <li>Connecte-toi puis ouvre Kloo dans Safari.</li>
                <li>Quand l&apos;app Kloo est ouverte, appuie sur Partager.</li>
                <li>Choisis Sur l’écran d’accueil puis Ajouter.</li>
              </ol>
            </article>
            <article className="install-card">
              <span className="install-device-badge">Android</span>
              <ol className="install-steps">
                <li>Connecte-toi puis ouvre l&apos;app Kloo dans Chrome.</li>
                <li>Appuie sur le menu ⋮ quand tu es dans l&apos;app.</li>
                <li>Choisis Installer l’application.</li>
              </ol>
            </article>
            <article className="install-card">
              <span className="install-device-badge">Ordinateur</span>
              <ol className="install-steps">
                <li>Connecte-toi pour ouvrir Kloo sur <code>/app</code>.</li>
                <li>Dans Chrome ou Edge, clique sur Installer.</li>
                <li>Valide pour épingler Kloo comme une app.</li>
              </ol>
            </article>
          </div>
          <p className="install-note">
            Tu n&apos;installes pas la landing : tu installes la vraie app Kloo,
            une fois entrée dans <code>/app</code>.
          </p>
        </section>

        <section className="card fade-up">
          <div className="section-kicker">Le prix</div>
          <h3 className="section-h">Un prix fait pour les étudiants</h3>
          <p className="section-sub">Simple, clair, sans surprise.</p>
          <div className="pricing-grid">
            <div className="price-side">
              <div className="price-main">
                <div className="price-big">
                  1,99 <span>€ / mois</span>
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
                Après tes 7 jours gratuits, Kloo te proposera de passer au
                paiement sécurisé pour continuer à 1,99 € par mois. Tu peux
                arrêter quand tu veux.
              </div>
            </div>
          </div>
        </section>

        {authCard}

        <footer className="card footer">
          <div className="footer-left">
            <h3>Kloo est prêt pour ton essai gratuit.</h3>
            <p>
              Commence sur le site, puis ouvre Kloo dans la vraie app web sur
              <code>/app</code>.
            </p>
          </div>
          <div className="footer-links">
            <a href="/infos-madagascar">Infos Madagascar</a>
            <a href="/cgu">CGU</a>
            <a href="/confidentialite">Politique de confidentialité</a>
            <a href="mailto:contact@kloo.site">Support client</a>
          </div>
        </footer>
      </div>

      <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMessage}</div>
    </>
  );
}
