import type { Metadata } from 'next';

/**
 * Watch page metadata is deliberately STATIC — no Directus fetch, no API calls.
 *
 * generateMetadata blocks the ENTIRE RSC response (including loading.tsx),
 * so any outbound I/O here causes a visible freeze on every navigation.
 * The actual video title is set client-side via document.title after the
 * /api/videos response arrives.
 *
 * Social crawlers see "Watch Video" as the title and a YouTube thumbnail
 * as the OG image. See docs/arch/010-video-loading-pipeline.md for the full rationale.
 */
export async function generateMetadata({
  params,
}: {
  params: { l1: string; l2: string; videoId: string };
}): Promise<Metadata> {
  const { videoId } = params;

  const title = 'Watch Video';
  const description = 'Watch videos with interactive dual subtitles on Language Player.';
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return {
    title,
    description,
    openGraph: {
      images: [{ url: thumbnail, width: 480, height: 360 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [thumbnail],
    },
  };
}

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
