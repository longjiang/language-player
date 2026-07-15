import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Customize your Language Player experience.',
  openGraph: {
    images: [{ url: '/og?emoji=%E2%9A%99%EF%B8%8F&title=Settings', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%E2%9A%99%EF%B8%8F&title=Settings'],
  },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
