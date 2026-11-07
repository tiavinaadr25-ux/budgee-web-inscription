# Emails automatiques Kloo avec Brevo

## Contenu et audience

- Bienvenue : uniquement les comptes créés depuis le 7 novembre 2026 à 00 h, heure de Paris, après confirmation de leur adresse email. Aucun rattrapage des inscriptions précédentes.
- Suivi J+3 : même audience que le bienvenue, une seule fois, au moins 72 heures après confirmation de l’adresse. Le plafond d’un email de suivi par 24 heures peut différer l’envoi.
- Fin d’essai et Mobile Money : uniquement les comptes créés depuis le 23 octobre 2026 à 00 h, heure de Paris (quinze jours avant le lancement), puis les inscriptions suivantes. Cette borne est fixe, pas une fenêtre glissante qui exclurait les clients plus tard. Les messages sont envoyés seulement lorsque l’événement correspondant est pertinent.
- Fin d’essai : dernier abonnement dont l’essai est terminé depuis cette borne, sans accès actif. Aucun message de fin d’essai n’est envoyé à un compte dont le dernier accès est déjà payé et actif.
- Mobile Money : confirmation d’une commande de production `completed` avec accès valide et commande récente ; rappel dans les 24 heures précédant la fin de l’accès courant ; avis après son expiration récente. Les commandes sandbox, en attente, échouées, remboursées ou doublonnées ne constituent pas des confirmations de paiement.

Les six HTML validés sont intégrés dans `server/lifecycle-email-templates.ts` ; le rendu et sa version texte sont dans `server/lifecycle-emails.ts`. Brevo reçoit directement le contenu : aucun identifiant de modèle Brevo n’est nécessaire. Les liens renvoient vers le compte existant ; ils ne créent ni accès, ni essai supplémentaire, ni paiement. Les dates des accès Mobile Money sont affichées dans le fuseau Madagascar. Les noms sont échappés avant affichage.

## Installation

1. Créer le compte Brevo et terminer les vérifications demandées pour les emails transactionnels.
2. Déclarer un expéditeur et authentifier son domaine dans Brevo. Utiliser une adresse dont les réponses sont lues ; `contact@kloo.site` n’est qu’un exemple si cette boîte n’existe pas encore. Ajouter dans le DNS du domaine les enregistrements exacts fournis par Brevo, sans remplacer les réglages mail existants au hasard.
3. Créer une clé **API Brevo**, distincte d’une clé SMTP, à usage serveur. La conserver dans Netlify, jamais dans le navigateur, dans Git ou dans un message de chat.
4. Dans Netlify, contexte Production, scope Functions (All scopes convient aussi), renseigner :
   - `EMAIL_AUTOMATION_ENABLED=false` pendant l’installation ;
   - `BREVO_API_KEY` ;
   - `BREVO_SENDER_EMAIL` ;
   - `BREVO_SENDER_NAME=Kloo` ;
   - `BREVO_REPLY_TO_EMAIL=contact@kloo.site` : boîte Zimbra qui reçoit les réponses, indépendante de l’expéditeur. Cette option ne remplace pas la validation de l’expéditeur et de son domaine d’envoi dans Brevo ;
   - `EMAIL_UNSUBSCRIBE_SECRET` : secret aléatoire d’au moins 32 caractères, fourni au propriétaire dans le fichier de configuration privé ; conserver sa valeur dans le temps ;
   - `EMAIL_DAILY_LIMIT=100` : plafond global sur 24 heures, à adapter au forfait et au volume souhaité (1 à 1000).
5. Exécuter `supabase/migrations/202611010001_lifecycle_emails.sql` puis `supabase/migrations/202611070001_email_rollout.sql` dans Supabase SQL Editor. Le second est aussi nécessaire sur une installation existante : il ajoute le suivi J+3, fixe les deux audiences et annule les anciens messages en attente hors audience. Aucun email n’est envoyé par ces scripts et aucun abonnement n’est modifié. Le code refuse de traiter la file tant que la version et les dates de cette migration ne sont pas installées.
6. Déployer le code. `/api/emails/status` affiche la disponibilité, sans données de destinataires. Vérifier les modèles puis valider un envoi de test vers sa propre adresse avec Brevo avant l’ouverture aux clients.
7. Quand l’expéditeur et l’envoi sont vérifiés, passer `EMAIL_AUTOMATION_ENABLED=true` et redéployer. La fonction `lifecycle-emails` doit être affichée comme Scheduled dans Netlify. Elle collecte et traite automatiquement les événements toutes les cinq minutes, selon les deux audiences fixes approuvées.

Les variables Stripe, Voaray, Web Push et les emails de sécurité Supabase restent indépendants de ce service. Les emails de confirmation d’adresse continuent de fonctionner comme avant ; le bienvenue Kloo est envoyé après confirmation.

## Fiabilité et désinscription

La file privée garde une clé unique par événement et destinataire, et des baux empêchent deux tâches de traiter simultanément le même email. La clé d’idempotence Brevo est l’UUID de la ligne. Seules trois tentatives sont possibles dans les vingt minutes suivant la première, sous la fenêtre de déduplication Brevo ; au-delà, le statut passe à `review`, sans nouvel envoi automatique. Ne pas remettre ces lignes en attente sans vérifier les logs Brevo : l’email a pu être accepté malgré une réponse réseau perdue.

Le statut `sent` signifie **accepté par Brevo**, pas réception prouvée dans la boîte du destinataire. Les rejets, blocages ou spams se contrôlent dans les journaux Brevo. Les logs Netlify n’affichent que des compteurs, sans adresses, contenus ni clés.

Hors confirmations de paiements distincts, au plus un email de suivi par compte est envoyé sur 24 heures. Les relances sont revérifiées juste avant envoi ; un compte renouvelé, supprimé ou désinscrit n’est pas relancé. Le lien de désinscription signé demande un clic de confirmation : un scanner de liens qui visite la page ne désinscrit pas la personne. Il arrête les six types d’emails automatiques, sans toucher aux emails de sécurité/connexion Supabase.

## Tests

`tests/lifecycle-emails.cjs` vérifie configuration, destinataire unique, désinscription, échappement, API Brevo et reprises. `tests/netlify-email-load.cjs` charge la vraie fonction compilée en ESM dans Node, sans dépendance Next.js et sans envoi réel. La migration est aussi vérifiée dans une base PostgreSQL isolée : audience, déduplication, renouvellement, plafonds, permissions et suppression du compte.

Sources fournisseur : https://developers.brevo.com/reference/send-transac-email et https://developers.brevo.com/docs/heterogenous-versions-batch-emails.
