import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kloo - Informations Madagascar',
  description:
    "Informations d'établissement et de formalisation de Kloo à Madagascar.",
};

const sections = [
  {
    title: '1. Objet de cette page',
    body: [
      "Cette page présente les informations d’établissement actuellement communiquées par Kloo pour son activité en cours de structuration à Madagascar.",
      "Elle a vocation à informer les utilisateurs pendant la phase de formalisation administrative. Les mentions légales et contractuelles définitives seront complétées dès finalisation du dossier.",
    ],
  },
  {
    title: '2. Pays d’établissement',
    body: [
      "Kloo est rattaché à un projet d’exploitation basé à Madagascar.",
      "La structure juridique définitive, son adresse complète et ses références administratives seront publiées ici dès validation finale.",
    ],
  },
  {
    title: '3. Situation administrative actuelle',
    body: [
      "Le dossier d’identification et de formalisation de l’activité est en cours de traitement à Madagascar.",
      "Numéro d’identification fiscale (NIF) : en cours d’attribution.",
    ],
  },
  {
    title: '4. Contact utilisateur',
    body: [
      "Pour toute question liée au compte, au support, à l’abonnement, à la confidentialité ou à la suppression de données, tu peux écrire à contact@kloo.site.",
    ],
  },
  {
    title: '5. Mise à jour future',
    body: [
      "Cette page sera mise à jour pour intégrer le nom légal définitif, l’adresse d’exploitation, les références d’immatriculation utiles et les informations contractuelles consolidées.",
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

export default function InfosMadagascarPage() {
  return (
    <main style={pageStyles.main}>
      <section style={pageStyles.section}>
        <a href="/" aria-label="Fermer" title="Fermer" style={pageStyles.closeLink}>
          ×
        </a>
        <h1 style={pageStyles.title}>Informations Madagascar</h1>
        <p style={pageStyles.lead}>
          Kloo prépare sa base administrative à Madagascar. Cette page sert de
          point d’information transitoire tant que les éléments définitifs de
          formalisation sont encore en cours de finalisation.
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
