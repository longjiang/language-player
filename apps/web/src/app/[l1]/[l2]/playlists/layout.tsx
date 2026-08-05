import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t('title.playlists'),
    description: t('msg.playlists_description'),
    openGraph: {
      images: [{
        url: `/og?emoji=%F0%9F%8E%AC&title=${encodeURIComponent(t('title.playlists'))}`,
        width: 1200,
        height: 630,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`/og?emoji=%F0%9F%8E%AC&title=${encodeURIComponent(t('title.playlists'))}`],
    },
  };
}

export default function PlaylistsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
