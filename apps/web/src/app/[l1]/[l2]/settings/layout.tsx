import type { Metadata } from 'next';
import { SettingsSidebar } from './_components/SettingsSidebar';

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
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 lg:px-0">
      <aside className="hidden lg:block">
        <SettingsSidebar />
      </aside>
      <main>{children}</main>
    </div>
  );
}
