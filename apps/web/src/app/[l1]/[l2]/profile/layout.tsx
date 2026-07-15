import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your Language Player profile and learning statistics.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%91%A4&title=Profile', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%91%A4&title=Profile'],
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
