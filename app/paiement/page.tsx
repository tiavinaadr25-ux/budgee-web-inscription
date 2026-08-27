import type { Metadata } from 'next';

import PaymentClient from '../PaymentClient';

export const metadata: Metadata = {
  title: 'Kloo - Paiement',
  description:
    'Page de paiement Kloo après l’essai gratuit ou pour reprendre un abonnement.',
};

export default function PaymentPage() {
  return <PaymentClient />;
}
