# Paiement débité, accès non activé

Ne pas demander au client de payer une seconde fois. Relever sa référence de transaction, l’heure du paiement et la référence marchand associée dans Voaray, puis rapprocher cette référence de `voaray_orders.id`. Un reçu ou la redirection du navigateur ne remplace pas une confirmation serveur authentifiée.

Le webhook est `https://kloo.site/api/voaray/webhook`. Il vérifie la signature HMAC du corps exact, puis la référence, l’environnement, le montant et la devise avant d’appeler la fonction transactionnelle Supabase. Les signatures hexadécimales brutes et préfixées par `sha256=` sont acceptées ; elles restent soumises au même contrôle cryptographique.

Vérifier dans Netlify que `VOARAY_WEBHOOK_SECRET` correspond au secret webhook de l’environnement Voaray utilisé. Le secret de signature API et le secret webhook peuvent être distincts. Ce paramètre est désormais obligatoire : aucun repli implicite sur le secret API. Ne jamais copier ces secrets dans un ticket ou des logs.

Exécuter également `supabase/migrations/202610300001_voaray_reconciliation.sql` : deux colonnes privées et des index sont ajoutés à la table existante, sans suppression de données. Tant que cette migration ou le secret webhook manque, aucun nouveau checkout ne peut être ouvert.

La réponse d’initiation doit fournir l’identifiant de transaction Voaray (`trx_id`, `transaction_id` ou `info.ref_trx` selon le format du fournisseur). Kloo l’enregistre avant de donner l’URL de paiement au navigateur. La vérification de secours appelle ensuite `verify-payment` avec les identifiants serveur et cet identifiant enregistré. Aucun identifiant de transaction fourni par le navigateur ne peut activer un accès. Montant, devise, état et identité sont contrôlés, puis la même fonction SQL idempotente active le mois payé. Si Voaray renvoie seulement un montant net après frais, la vérification de secours ne valide pas une somme différente : le webhook signé reste nécessaire.

Une vérification de secours est tentée au retour du paiement ou avec le bouton de vérification. La fonction Netlify `voaray-reconcile` reprend aussi jusqu’à cinq commandes récentes toutes les cinq minutes, avec une limite de fréquence par commande. Elle ne reprend que les nouvelles commandes dotées d’une référence fournisseur enregistrée ; les anciens paiements sans ce lien ne sont pas réattribués automatiquement.

Dans les logs Netlify, les rejets du webhook affichent leur statut et la cause générique. Une erreur 401 indique une signature refusée ; 400 une notification incohérente ; 404 une commande inconnue ; 503 un échec temporaire du stockage ou de l’activation. Les erreurs d’activation incluent le code Supabase et l’identifiant de commande, sans données financières ni identifiants secrets.

La page de paiement propose « J’ai déjà payé : vérifier mon accès ». Ce bouton retrouve la dernière commande du compte connecté, même si le retour depuis Voaray a été fermé, et tente la vérification serveur. Il ne crée aucun paiement et n’active jamais un accès à partir d’une déclaration du navigateur. Réexécuter une confirmation déjà traitée ne doit pas accorder un second mois.

La page Connexion laisse saisir un autre compte même si une session existe encore. « Changer de compte » sur la page de paiement ferme seulement la session de cet appareil et affiche le formulaire de connexion. Les callbacks de confirmation d’email conservent leur parcours.

Documentation du fournisseur : https://app.voaray.com/api-docs
