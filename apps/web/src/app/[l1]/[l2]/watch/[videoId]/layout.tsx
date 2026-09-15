import type { Metadata } from 'next';
import { youtubeThumbnail } from '@/lib/video-service';

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
const SITE_URL = process.env.AUTH_URL || 'https://language-player.netlify.app';

export async function generateMetadata(
  props: {
    params: Promise<{ l1: string; l2: string; videoId: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const { videoId } = params;

  const title = 'Watch Video';
  const description = 'Watch videos with interactive dual subtitles on Language Player.';
  // `youtubeThumbnail` returns the same-origin proxy path, made absolute here
  // because a crawler never resolves it against our origin. Link previews used
  // to point at img.youtube.com, which is blocked in mainland China, so shares
  // previewed blank there (ADR-0046).
  const thumbnail = `${SITE_URL}${youtubeThumbnail(videoId, 'hqdefault')}`;

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
