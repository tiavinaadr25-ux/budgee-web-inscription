import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title:
    "Budgee - L'application de budget étudiant pour comprendre ses dépenses et éviter les fins de mois galères",
  description:
    "Budgee est l'application de budget étudiant qui t'aide à voir où part ton argent, éviter d'être à sec avant la fin du mois et reprendre le contrôle simplement. 7 jours d'essai gratuit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
