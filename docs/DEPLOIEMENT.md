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
