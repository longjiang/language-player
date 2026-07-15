import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saved Words',
  description: 'Review your saved vocabulary with definitions, examples, and progress tracking.',
  openGraph: {
    images: [{ url: '/og?emoji=%E2%AD%90&title=Saved%20Words', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%E2%AD%90&title=Saved%20Words'],
  },
};

export default function SavedWordsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
