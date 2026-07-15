import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Go Pro',
  description: 'Unlock unlimited transcripts, thousands of word examples, and more with Language Player Pro.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%9A%80&title=Go%20Pro', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%9A%80&title=Go%20Pro'],
  },
};

export default function GoProLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
