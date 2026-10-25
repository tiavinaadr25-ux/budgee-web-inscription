# Déployer Kloo sur Netlify

Les paiements Stripe de production existants à 1,99 EUR doivent conserver leurs variables et leur prix actuels. Ne pas importer un fichier .env local en bloc : le fichier utilisé pour les essais sur cet ordinateur contient des identifiants Stripe de test différents.

## Variables côté serveur

Conserver les variables Stripe et Supabase de production déjà utilisées par le site. Vérifier que la clé serveur Supabase dispose des droits nécessaires aux fonctions Voaray.

Ajouter dans les variables Netlify, pour les builds et fonctions en production :

- VOARAY_API_KEY
- VOARAY_MERCHANT_KEY
- VOARAY_API_SECRET
- VOARAY_WEBHOOK_SECRET si le secret IPN est distinct du secret API
- VOARAY_ENVIRONMENT=production
- VOARAY_PRICE_AMOUNT=9000
- VOARAY_CURRENCY=MGA
- SITE_URL=https://kloo.site

Les clés secrètes sont à récupérer depuis le fichier .env local ou le tableau de bord du fournisseur ; elles ne sont pas présentes dans Git.

Le prix de la carte reste fixé par STRIPE_PRICE_ID dans l’environnement de production. Les routes refusent un prix qui ne correspond pas aux 1,99 EUR/mois annoncés.

## Base Supabase

La migration `supabase/migrations/202610210001_voaray.sql` a déjà été exécutée pour ce projet et ses fonctions ont été vérifiées. Ne pas réinitialiser la base ni effacer les paiements existants.

## Vérification après déploiement

- L’accueil doit afficher la navigation simplifiée et le téléphone complet.
- `/api/voaray/checkout` doit répondre en JSON avec un montant de 9000 et la devise MGA.
- Voaray doit pouvoir envoyer ses notifications à `https://kloo.site/api/voaray/webhook`.
- Conserver l’endpoint Stripe de production existant ; le code de la route Next se trouve à `/api/stripe-webhook`.
- Tester le paiement sandbox avant de déclarer le parcours fournisseur complet validé. Aucun paiement réel n’a été déclenché pendant les vérifications automatiques.

## Guide de l’application

Le guide s’ouvre au premier accès après la configuration initiale du compte. Il reste accessible dans Profil → Aide.

Ce dépôt contient l’export compilé Expo. Après une nouvelle exportation, exécuter `node scripts/enhance-web-app.cjs` pour réappliquer les points d’entrée du guide. Le script s’arrête si la structure attendue ne correspond plus à l’export.

## Contrôles réalisés

Build Next.js et TypeScript, tests de confirmation Stripe, de webhooks Stripe, d’essai et de notifications Voaray. Le SQL Voaray a été exécuté dans une base PostgreSQL de test isolée : répétitions, sandbox, remboursement et contrôle d’accès.

## Modes de paiement et démonstration

Profil → Mode de paiement ouvre /paiement/gestion. Modifier ma carte utilise Stripe Checkout en mode setup : aucune nouvelle souscription, carte appliquée aux prochains renouvellements via le webhook checkout.session.completed déjà utilisé, avec confirmation de secours au retour. Conserver cet événement dans la configuration du webhook Stripe.

Passer à Mobile Money arrête le renouvellement carte à la fin de la période. Le paiement Voaray reste bloqué tant que l’accès actuel est actif. La simulation est retirée. Le bouton Mobile Money ouvre le vrai paiement Voaray lorsque l’accès actuel est terminé. Les écrans du fournisseur et les opérateurs disponibles dépendent du compte marchand.

Le fichier .env préexistant a été retiré du suivi Git. Ses anciennes valeurs restent dans l’historique : renouveler les clés privées concernées puis reporter les nouvelles valeurs dans Netlify et les services qui les utilisent.

## Dépenses et épargne

Les composants web éditables sont dans web-app/components et le calcul des montants dans web-app/lib/money.js. scripts/build-web-flows.cjs les compile contre les modules React Native déjà présents dans cet export Expo. scripts/enhance-web-app.cjs exécute cette étape et réapplique les raccordements. Si l’export change de structure ou de modules, le script s’arrête pour éviter de modifier un mauvais composant.

Les formulaires attendent le résultat du stockage avant de se vider, gardent les champs en cas d’échec et verrouillent les doubles clics. Une addition d’épargne augmente currentAmount et monthlyContribution du même montant ; modifier un objectif sans nouveau versement ne compte pas le montant du mois une deuxième fois. Les anciens soldes ne sont pas recalculés automatiquement : Modifier → Total déjà épargné permet une correction explicite.

Vérifications : tests/web-flows.cjs, neuf suites de tests de régression et contrôle des vrais composants dans un navigateur sur données fictives (50 + 10 = 60, progression 60 %, échec et reprise d’une dépense, double clic). Aucun compte client réel n’a été modifié pour ces tests.

## Saisie tactile et grands montants

Le budget utilise désormais un formulaire web sans fermeture globale du clavier au toucher. Chaque libellé peut donner le focus à son montant et la touche Suivant reste une option. Les champs conservent une taille minimale de 16 px. AutoAmount mesure la largeur réelle du texte et de son conteneur, réduit la police en cas de besoin et retrouve sa taille initiale si la place augmente. Les colonnes du tableau de bord réservent la place des informations de droite.

Contrôles sur données fictives : colonne de 320 px, montants à six chiffres affichés en entier, passage direct du champ Courses au champ Loyer par clic, dix suites de tests incluant adaptive-amount.cjs et web-flows.cjs.
