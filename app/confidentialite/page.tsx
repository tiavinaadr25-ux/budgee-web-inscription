// MIGRATED FROM: confidentialite.html
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kloo - Politique de confidentialité',
  description:
    'Politique de confidentialité et informations RGPD de Kloo.',
};

const sections = [
  {
    title: '1. Responsable du traitement et point de contact',
    body: [
      "Kloo est un service de budget personnel destiné aux étudiants, alternants et jeunes actifs. Pour les traitements décrits sur cette page, le responsable du traitement est l’équipe Kloo, joignable à contact@kloo.site.",
      "Si la structure juridique ou les mentions légales évoluent, cette page sera mise à jour sans réduire les droits déjà décrits ici.",
    ],
  },
  {
    title: '2. Données que nous collectons',
    body: [
      "Nous pouvons traiter les données d’inscription et de connexion (email, mot de passe chiffré côté fournisseur d’authentification, type de profil, nom ou prénom si renseigné).",
      "Nous pouvons aussi traiter les données d’usage Kloo : catégories, budgets, dépenses saisies manuellement, objectifs d’épargne, paramètres de notifications et informations techniques nécessaires au bon fonctionnement du service.",
      "Pour l’abonnement, Kloo ne stocke jamais le numéro complet de carte bancaire. Le paiement peut être géré par un ou plusieurs prestataires compatibles, qui nous renvoient seulement des données minimales de facturation, de transaction et de statut d’abonnement.",
      "Lorsque tu contactes le support client, nous pouvons aussi traiter le contenu de ta demande, ton adresse email, les éléments utiles à la vérification de ton compte et l’historique de l’échange.",
    ],
  },
  {
    title: '3. Finalités et bases juridiques',
    body: [
      "Nous utilisons ces données pour créer et sécuriser ton compte, afficher ton budget, enregistrer tes dépenses, suivre ton essai ou ton abonnement, répondre à tes demandes de support et améliorer la stabilité de Kloo.",
      "La base juridique principale est l’exécution du contrat quand tu crées un compte, utilises Kloo ou souscris à l’abonnement. Certaines mesures techniques reposent aussi sur notre intérêt légitime à sécuriser, maintenir et défendre le service. Si des emails marketing sont ajoutés plus tard, ils reposeront sur ton consentement lorsqu’il est requis.",
    ],
  },
  {
    title: '4. Sous-traitants et destinataires',
    body: [
      "Kloo s’appuie notamment sur Supabase pour l’authentification et la base de données, sur un ou plusieurs prestataires de paiement compatibles pour la gestion des abonnements et transactions, et sur Netlify pour l’hébergement de la version web.",
      "Ces prestataires n’accèdent aux données que dans la limite nécessaire à leur mission technique. Nous évitons d’exposer des informations sensibles au frontend quand elles doivent rester côté serveur.",
    ],
  },
  {
    title: '5. Durée de conservation',
    body: [
      "Les données du compte et du budget sont conservées tant que le compte reste actif, puis supprimées ou anonymisées dans un délai raisonnable après demande de suppression ou après fermeture définitive du service, sauf obligation légale contraire.",
      "Les éléments de facturation, de preuve de paiement et les échanges de support peuvent être conservés plus longtemps lorsqu’ils sont nécessaires à la gestion d’un litige, à la prévention des fraudes ou au respect d’obligations comptables, fiscales ou légales.",
    ],
  },
  {
    title: '6. Cookies, stockage local et session',
    body: [
      "Kloo n’utilise pas de cookies publicitaires sur cette landing. En revanche, des traceurs ou stockages techniques peuvent être utilisés pour maintenir la session, finaliser la connexion sécurisée, lancer une page de paiement sécurisée et mémoriser certains états utiles au fonctionnement du service.",
      "La version actuelle de Kloo web s’appuie surtout sur la session navigateur de Supabase et sur du stockage local technique, pas sur des cookies marketing maison. Si des traceurs non essentiels sont ajoutés plus tard, une information et, si nécessaire, un recueil de consentement seront mis en place.",
    ],
  },
  {
    title: '7. Sécurité',
    body: [
      "Nous mettons en place des mesures raisonnables de sécurité : HTTPS en production, séparation des clés publiques et des clés serveur, headers de sécurité, validation des accès côté serveur pour les routes sensibles, et restriction d’origine pour les endpoints de paiement.",
      "Malgré ces efforts, aucun système n’offre un risque zéro. Si tu penses avoir détecté une faille ou un accès anormal, écris-nous rapidement à contact@kloo.site.",
    ],
  },
  {
    title: '8. Tes droits RGPD',
    body: [
      "Tu peux demander l’accès à tes données, leur rectification, leur suppression, la limitation du traitement, la portabilité si elle s’applique, ainsi que t’opposer à certains traitements. Tu peux aussi introduire une réclamation auprès de l’autorité de contrôle compétente pour la protection des données lorsque ce droit s’applique.",
      "Pour exercer tes droits ou contacter le support au sujet de tes données, écris à contact@kloo.site en précisant l’email de ton compte Kloo et l’objet de ta demande.",
    ],
  },
  {
    title: '9. Mise à jour de cette politique',
    body: [
      "Cette politique peut évoluer si Kloo change d’architecture, de prestataires ou de fonctionnalités. La date de mise à jour affichée ci-dessous sera adaptée à chaque modification importante.",
    ],
  },
];

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
    maxWidth: '820px',
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
  lead: {
    margin: '0 56px 16px 0',
    color: '#485366',
    lineHeight: 1.7,
    fontSize: '0.98rem',
  },
  title: {
    margin: '0 56px 10px 0',
    fontSize: '2rem',
    letterSpacing: '-0.05em',
  },
  h2: {
    margin: '22px 0 8px',
    fontSize: '1.08rem',
    letterSpacing: '-0.03em',
  },
  p: {
    margin: '0 0 10px',
    color: '#485366',
    lineHeight: 1.7,
  },
  meta: {
    margin: '16px 0 0',
    color: '#6a7484',
    lineHeight: 1.6,
    fontSize: '0.84rem',
  },
} as const;

export default function ConfidentialitePage() {
  return (
    <main style={pageStyles.main}>
      <section style={pageStyles.section}>
        <a href="/" aria-label="Fermer" title="Fermer" style={pageStyles.closeLink}>
          ×
        </a>
        <h1 style={pageStyles.title}>Politique de confidentialité</h1>
        <p style={pageStyles.lead}>
          Cette page décrit comment Kloo traite les données personnelles liées à
          l’utilisation de la landing, du compte utilisateur, du budget et de
          l’abonnement.
        </p>
        <p style={pageStyles.p}>
          Pour toute question liée à tes données personnelles, au support, à la
          confidentialité ou à la suppression de compte, tu peux écrire à{' '}
          <a
            href="mailto:contact@kloo.site"
            style={{ color: '#2a68aa', textDecoration: 'none', fontWeight: 700 }}
          >
            contact@kloo.site
          </a>
          .
        </p>

        {sections.map((section) => (
          <div key={section.title}>
            <h2 style={pageStyles.h2}>{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} style={pageStyles.p}>
                {paragraph}
              </p>
            ))}
          </div>
        ))}

        <p style={pageStyles.meta}>
          Dernière mise à jour : 27 août 2026.
          <br />
          <a
            href="mailto:contact@kloo.site"
            style={{ color: '#2a68aa', textDecoration: 'none', fontWeight: 700 }}
          >
            contact@kloo.site
          </a>
        </p>
      </section>
    </main>
  );
}
