import type { Metadata } from 'next';
import { translateText } from '@/lib/translate';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? 'https://directusvps.zerotohero.ca/zerotohero';

interface VideoData {
  title?: string;
  youtube_id?: string;
}

async function getVideoTitle(videoId: string, l2: string): Promise<VideoData | null> {
  try {
    const suffix = getTableSuffix(l2);
    const fields = 'youtube_id,title';
    const url = `${DIRECTUS_URL}/items/youtube_videos${suffix}?filter[youtube_id][eq]=${videoId}&fields=${fields}&limit=1`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.data?.[0] ?? json?.data ?? json?.[0] ?? null;
    return item ?? null;
  } catch {
    return null;
  }
}

/** Map L2 code to Directus table suffix (mirrors the API route). */
const TABLE_SUFFIX: Record<string, string> = {
  eu: '_2', vi: '_2', ko: '_3', zh: '_4', en: '_5', de: '_6', ja: '_7',
  fr: '_8', es: '_9', ca: '_9', ru: '_9', tr: '_10', pl: '_10', nl: '_10',
  he: '_11', pt: '_11', el: '_11', uk: '_11', cs: '_11', ar: '_11', sk: '_11', ms: '_11',
  it: '_12', id: '_13', sv: '_13', no: '_13', nan: '_13', th: '_14', my: '_14',
};
function getTableSuffix(l2: string): string { return TABLE_SUFFIX[l2] ?? ''; }

export async function generateMetadata({
  params,
}: {
  params: { l1: string; l2: string; videoId: string };
}): Promise<Metadata> {
  const { videoId, l1, l2 } = params;
  const video = await getVideoTitle(videoId, l2);

  const rawTitle = video?.title?.trim() || 'Watch Video';
  const title = await translateText(rawTitle, l1, l2);
  const description = video?.title
    ? `Watch "${title}" with interactive dual subtitles on Language Player.`
    : 'Watch videos with interactive dual subtitles on Language Player.';

  // Use YouTube thumbnail as OG image
  const thumbnail = video?.youtube_id
    ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`
    : `/og?emoji=%F0%9F%8E%AC&title=${encodeURIComponent(title)}`;

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
