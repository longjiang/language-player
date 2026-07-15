import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live TV',
  description: 'Watch live TV channels with dual subtitles in your target language.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%93%A1&title=Live%20TV', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%93%A1&title=Live%20TV'],
  },
};

export default function LiveTvLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
