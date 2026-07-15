import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watch History',
  description: 'Your video watch history across all languages.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%95%90&title=Watch%20History', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%95%90&title=Watch%20History'],
  },
};

export default function WatchHistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
