// MIGRATED FROM: cgu.html
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Budgee - CGU',
  description: "Conditions générales d'utilisation de Budgee.",
};

const sections = [
  {
    title: '1. Objet',
    body: [
      "Les présentes conditions générales d’utilisation encadrent l’accès à Budgee, un service numérique d’aide au suivi de budget personnel. Elles s’appliquent à l’utilisation de la landing, du compte Budgee et des fonctionnalités accessibles dans la version en ligne du service.",
    ],
  },
  {
    title: '2. Création de compte',
    body: [
      "Pour utiliser Budgee, tu dois créer un compte avec des informations exactes et à jour. Tu es responsable de la confidentialité de tes identifiants et de l’usage fait depuis ton compte.",
      "Si tu constates un accès non autorisé à ton compte, tu dois changer ton mot de passe et contacter Budgee rapidement.",
    ],
  },
  {
    title: '3. Description du service',
    body: [
      "Budgee permet de suivre manuellement un budget, des catégories de dépenses, des objectifs d’épargne et des paramètres personnels liés à l’organisation budgétaire.",
      "Les fonctionnalités affichées sur le site au moment de ton utilisation sont celles qui font foi. Budgee peut évoluer, mais n’est pas tenu de maintenir des fonctions expérimentales ou non encore publiées.",
    ],
  },
  {
    title: '4. Essai gratuit et abonnement',
    body: [
      "Budgee peut proposer un essai gratuit de 7 jours, éventuellement prolongé par un code promotionnel valide. À l’issue de cette période, l’abonnement payant indiqué sur le site s’applique sauf résiliation avant la fin de l’essai.",
      "Le paiement est traité par Stripe. Budgee n’enregistre jamais directement le numéro complet de carte bancaire.",
    ],
  },
  {
    title: '5. Résiliation',
    body: [
      "Tu peux résilier ton abonnement selon les modalités affichées dans le service ou dans l’interface de paiement liée à ton compte. La résiliation met fin au renouvellement automatique, mais l’accès déjà payé ou déjà ouvert par l’essai reste disponible jusqu’à son échéance.",
    ],
  },
  {
    title: '6. Usage acceptable',
    body: [
      "Tu t’engages à ne pas détourner Budgee, à ne pas tenter d’accéder aux comptes d’autres utilisateurs, à ne pas perturber les infrastructures techniques et à ne pas utiliser le service à des fins illégales.",
    ],
  },
  {
    title: '7. Propriété intellectuelle',
    body: [
      "La marque Budgee, la landing, les contenus, le design, les textes, le code propriétaire et les éléments graphiques restent protégés par les droits applicables. Aucune cession de droits n’est accordée par la simple utilisation du service.",
    ],
  },
  {
    title: '8. Disponibilité et responsabilité',
    body: [
      "Budgee vise une disponibilité raisonnable mais ne garantit pas un fonctionnement sans interruption. Le service peut être suspendu temporairement pour maintenance, sécurité ou évolution produit.",
      "Budgee fournit un outil d’aide au suivi budgétaire. Les informations affichées ne remplacent ni un conseil bancaire, ni un conseil juridique, ni un conseil comptable personnalisé.",
    ],
  },
  {
    title: '9. Données personnelles',
    body: [
      "Le traitement des données personnelles est décrit dans la politique de confidentialité. En utilisant Budgee, tu reconnais avoir pris connaissance de cette politique.",
    ],
  },
  {
    title: '10. Droit applicable et contact',
    body: [
      "Ces conditions sont soumises au droit français. Pour toute question, difficulté ou demande liée au service, tu peux écrire à contact@budgee.app.",
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
    padding: '28px',
    borderRadius: '28px',
    border: '1px solid rgba(41, 57, 85, 0.14)',
    background: 'rgba(255, 251, 244, 0.97)',
    boxShadow: '0 24px 54px rgba(36, 46, 66, 0.12)',
  },
  lead: {
    margin: '0 0 16px',
    color: '#485366',
    lineHeight: 1.7,
    fontSize: '0.98rem',
  },
  title: {
    margin: '0 0 10px',
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

export default function CGUPage() {
  return (
    <main style={pageStyles.main}>
      <section style={pageStyles.section}>
        <h1 style={pageStyles.title}>Conditions générales d’utilisation</h1>
        <p style={pageStyles.lead}>
          Ces conditions définissent les règles d’utilisation de Budgee, la
          gestion du compte utilisateur et les conditions liées à l’essai gratuit
          puis à l’abonnement.
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
          Dernière mise à jour : 2 juin 2026.
          <br />
          <a
            href="mailto:contact@budgee.app"
            style={{ color: '#2a68aa', textDecoration: 'none', fontWeight: 700 }}
          >
            contact@budgee.app
          </a>
          {' · '}
          <a
            href="/"
            style={{ color: '#2a68aa', textDecoration: 'none', fontWeight: 700 }}
          >
            Retour à Budgee
          </a>
        </p>
      </section>
    </main>
  );
}
