// MIGRATED FROM: cgu.html
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Budgee - CGU',
};

export default function CGUPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: '32px 18px',
        fontFamily: 'var(--font-dm-sans), sans-serif',
        color: '#18202d',
        background: 'linear-gradient(180deg, #fcfaf5 0%, #f3ebdf 100%)',
      }}
    >
      <section
        style={{
          maxWidth: '760px',
          margin: '0 auto',
          padding: '28px',
          borderRadius: '28px',
          border: '1px solid rgba(41, 57, 85, 0.14)',
          background: 'rgba(255, 251, 244, 0.97)',
          boxShadow: '0 24px 54px rgba(36, 46, 66, 0.12)',
        }}
      >
        <h1
          style={{
            margin: '0 0 10px',
            fontSize: '2rem',
            letterSpacing: '-0.05em',
          }}
        >
          Conditions générales d’utilisation
        </h1>
        <p style={{ margin: '0 0 12px', color: '#485366', lineHeight: 1.6 }}>
          Cette page est une version provisoire des CGU de Budgee. Elle sera
          remplacée par la version juridique finale avant lancement public.
        </p>
        <p style={{ margin: '0 0 12px', color: '#485366', lineHeight: 1.6 }}>
          Pour toute question, tu peux nous écrire à{' '}
          <a
            href="mailto:contact@budgee.app"
            style={{ color: '#2a68aa', textDecoration: 'none', fontWeight: 700 }}
          >
            contact@budgee.app
          </a>
          .
        </p>
        <p style={{ margin: 0, color: '#485366', lineHeight: 1.6 }}>
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
