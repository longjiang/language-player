import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reader',
  description: 'Read texts with interactive word lookup and translations.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%93%9A&title=Reader', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%93%9A&title=Reader'],
  },
};

export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
