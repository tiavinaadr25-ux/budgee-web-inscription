// MIGRATED FROM: cgu.html
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kloo - CGU',
  description: "Conditions générales d'utilisation de Kloo.",
};

const sections = [
  {
    title: '1. Objet',
    body: [
      "Les présentes conditions générales d’utilisation encadrent l’accès à Kloo, un service numérique d’aide au suivi du budget personnel. Elles s’appliquent à la landing, au compte Kloo, à l’application web et aux fonctionnalités accessibles au moment de l’utilisation.",
    ],
  },
  {
    title: '2. Création de compte',
    body: [
      "Pour utiliser Kloo, tu dois créer un compte avec des informations exactes et à jour. Tu es responsable de la confidentialité de tes identifiants et de l’usage fait depuis ton compte.",
      "Si tu constates un accès non autorisé à ton compte, tu dois changer ton mot de passe et contacter rapidement le support client Kloo.",
    ],
  },
  {
    title: '3. Description du service',
    body: [
      "Kloo permet de suivre manuellement un budget, des catégories de dépenses, des objectifs d’épargne et des paramètres personnels liés à l’organisation budgétaire.",
      "Les fonctionnalités affichées sur le site au moment de ton utilisation sont celles qui font foi. Kloo peut évoluer, mais n’est pas tenu de maintenir des fonctions expérimentales ou non encore publiées.",
    ],
  },
  {
    title: '4. Essai gratuit et abonnement',
    body: [
      "Kloo peut proposer un essai gratuit de 7 jours. À l’issue de cette période, l’abonnement payant affiché sur le site s’applique sauf résiliation effectuée avant la fin de l’essai.",
      "Le paiement peut être traité par un ou plusieurs prestataires de paiement compatibles avec Kloo, y compris des moyens de paiement locaux lorsqu’ils sont activés. Kloo n’enregistre jamais directement le numéro complet de carte bancaire et ne reçoit que les informations strictement utiles à la gestion de l’abonnement.",
    ],
  },
  {
    title: '5. Support client',
    body: [
      "Le support client Kloo est joignable à l’adresse contact@kloo.site pour les questions liées au compte, à l’abonnement, aux incidents techniques, à la facturation, à la suppression de compte et aux demandes liées aux données personnelles.",
      "Pour traiter une demande, Kloo peut te demander des éléments de vérification raisonnables, par exemple l’email du compte, la date approximative de souscription ou la référence du paiement concerné.",
    ],
  },
  {
    title: '6. Résiliation et rétractation',
    body: [
      "Tu peux résilier ton abonnement selon les modalités affichées dans le service, dans l’interface de paiement liée à ton compte ou en écrivant au support client à contact@kloo.site.",
      "La résiliation met fin au renouvellement automatique, mais l’accès déjà payé ou déjà ouvert par l’essai reste disponible jusqu’à son échéance. Lorsqu’un droit légal de rétractation s’applique à une souscription à distance, il peut être exercé en contactant Kloo à la même adresse, sous réserve des exceptions prévues par la réglementation applicable.",
    ],
  },
  {
    title: '7. Usage acceptable',
    body: [
      "Tu t’engages à ne pas détourner Kloo, à ne pas tenter d’accéder aux comptes d’autres utilisateurs, à ne pas perturber les infrastructures techniques et à ne pas utiliser le service à des fins illégales.",
    ],
  },
  {
    title: '8. Propriété intellectuelle',
    body: [
      "La marque Kloo, la landing, les contenus, le design, les textes, le code propriétaire et les éléments graphiques restent protégés par les droits applicables. Aucune cession de droits n’est accordée par la simple utilisation du service.",
    ],
  },
  {
    title: '9. Données personnelles',
    body: [
      "Le traitement des données personnelles est décrit dans la politique de confidentialité. En utilisant Kloo, tu reconnais avoir pris connaissance de cette politique.",
    ],
  },
  {
    title: '10. Disponibilité et responsabilité',
    body: [
      "Kloo vise une disponibilité raisonnable mais ne garantit pas un fonctionnement sans interruption. Le service peut être suspendu temporairement pour maintenance, sécurité ou évolution produit.",
      "Kloo fournit un outil d’aide au suivi budgétaire. Les informations affichées ne remplacent ni un conseil bancaire, ni un conseil juridique, ni un conseil comptable personnalisé.",
    ],
  },
  {
    title: '11. Contact et évolution des mentions',
    body: [
      "Pour toute question, difficulté ou demande liée au service, tu peux écrire à contact@kloo.site.",
      "Si la structure juridique, les mentions d’éditeur ou les coordonnées contractuelles de Kloo évoluent, cette page sera mise à jour en conséquence.",
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

export default function CGUPage() {
  return (
    <main style={pageStyles.main}>
      <section style={pageStyles.section}>
        <a href="/" aria-label="Fermer" title="Fermer" style={pageStyles.closeLink}>
          ×
        </a>
        <h1 style={pageStyles.title}>Conditions générales d’utilisation</h1>
        <p style={pageStyles.lead}>
          Ces conditions définissent les règles d’utilisation de Kloo, la
          gestion du compte utilisateur, le fonctionnement du support client et
          les conditions liées à l’essai gratuit puis à l’abonnement.
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
