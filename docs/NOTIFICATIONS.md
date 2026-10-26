# Notifications PWA

## Activer en production

1. Dans Supabase → SQL Editor, exécuter `supabase/migrations/202610250001_web_push.sql`. Le script crée deux tables privées : les appareils abonnés et le suivi des envois. Il peut être relancé sans effacer leurs données.
2. Dans Netlify → Project configuration → Environment variables, ajouter `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` et `WEB_PUSH_SUBJECT`, depuis le fichier privé remis au propriétaire du projet. Les rendre disponibles pour les Functions en Production. Ne pas remplacer les variables Stripe, Voaray ou Supabase existantes.
3. Déployer le commit contenant cette intégration. Conserver la même paire de clés lors des prochains déploiements. La clé privée reste côté serveur, hors Git.
4. Dans Netlify → Functions, vérifier la présence de `push-reminders` et sa programmation toutes les cinq minutes. Cette fonction s’exécute sur le site de production publié ; aucune URL de cron publique à appeler.

## Vérifier sur son téléphone

Dans Kloo, ouvrir Profil → Notifications, puis « Activer sur cet appareil » et accepter l’autorisation du navigateur. Sur iPhone/iPad compatible Web Push, ajouter d’abord Kloo à l’écran d’accueil puis ouvrir l’application depuis son icône. Cliquer sur « Envoyer un test » pour vérifier une réception réelle, puis choisir les catégories et l’heure du rappel du soir.

Les préférences concernent chaque appareil. Le rappel suit son fuseau horaire. La connexion, les économies de batterie et les réglages système peuvent retarder les notifications. Une autorisation refusée doit être rétablie dans les réglages du navigateur. La déconnexion désabonne cet appareil du compte.

## Diagnostic

- `/api/push` expose uniquement la disponibilité et la clé publique. `available: false` signifie que les variables serveur ou la table ne sont pas accessibles : vérifier les scopes Netlify, redéployer et consulter les logs sans copier de secrets.
- Si le test échoue, vérifier l’autorisation système, la session connectée, les variables Supabase serveur et la migration.
- Les rappels automatiques exigent un accès Kloo actif et au moins une catégorie activée. Les alertes sont dédupliquées ; un appareil expiré est retiré après une réponse 404/410 du fournisseur.
- Les messages ne contiennent aucun montant ni nom de dépense. Les endpoints et clés des appareils sont privés, accessibles uniquement au serveur authentifié.

Les tests automatisés vérifient notamment les autorisations, le chiffrement, les doublons et le service worker. Ils ne remplacent pas le test de réception sur un appareil réel après déploiement.
