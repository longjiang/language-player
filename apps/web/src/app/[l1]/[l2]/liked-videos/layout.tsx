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
    title: t('title.liked_videos'),
    description: t('msg.liked_videos_description'),
    openGraph: {
      images: [{
        url: `/og?emoji=%E2%9D%A4%EF%B8%8F&title=${encodeURIComponent(t('title.liked_videos'))}`,
        width: 1200,
        height: 630,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`/og?emoji=%E2%9D%A4%EF%B8%8F&title=${encodeURIComponent(t('title.liked_videos'))}`],
    },
  };
}

export default function LikedVideosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
