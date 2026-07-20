import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Web Reader',
  description: 'Read web articles with interactive word lookup and translations.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%8C%90&title=Web+Reader', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%8C%90&title=Web+Reader'],
  },
};

export default function WebReaderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
