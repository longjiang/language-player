import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Review',
  description: 'Review your saved words with spaced repetition flashcards.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%94%84&title=Review', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%94%84&title=Review'],
  },
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
