import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(
  props: { params: Promise<{ l1: string; l2: string }> },
): Promise<Metadata> {
  // Locale is passed explicitly: `setRequestLocale` from the segment layout did
  // not reach the request config (SPEC-108 Phase 2 follow-up).
  const { l1 } = await props.params;
  const t = await getTranslations({ locale: l1 });
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
