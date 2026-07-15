import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dictionary',
  description: 'Look up words with definitions, examples, and frequency levels in your target language.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%93%96&title=Dictionary', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%93%96&title=Dictionary'],
  },
};

export default function DictionaryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
