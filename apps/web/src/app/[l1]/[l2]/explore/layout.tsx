import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Explore Videos',
  description: 'Browse and discover videos with interactive dual subtitles in your target language.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%8E%AC&title=Explore%20Videos', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%8E%AC&title=Explore%20Videos'],
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
