import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kloo',
    short_name: 'Kloo',
    description:
      "Kloo t'aide à suivre ton budget étudiant et à garder ton essai sous la main depuis l’écran d’accueil.",
    start_url: '/',
    display: 'standalone',
    background_color: '#f4ede0',
    theme_color: '#2558a0',
    lang: 'fr',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
