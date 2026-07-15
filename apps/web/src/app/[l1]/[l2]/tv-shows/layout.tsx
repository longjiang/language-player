import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TV Shows',
  description: 'Watch TV shows with interactive dual subtitles in your target language.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%93%BA&title=TV%20Shows', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%93%BA&title=TV%20Shows'],
  },
};

export default function TvShowsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
