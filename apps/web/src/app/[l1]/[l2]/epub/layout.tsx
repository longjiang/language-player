import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EPUB Reader',
  description: 'Read EPUB ebooks with interactive word lookup and translations.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%93%96&title=EPUB+Reader', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%93%96&title=EPUB+Reader'],
  },
};

export default function EpubLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
