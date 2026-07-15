import type { Metadata } from 'next';
import { languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';

async function getRecommendedIds(l2: string): Promise<string[]> {
  try {
    const res = await fetch(`${PYTHON_API_URL}/recommend-videos?l2=${l2}&limit=4`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const videos: { youtube_id?: string }[] = Array.isArray(data) ? data : data?.data ?? [];
    return videos.slice(0, 4).map(v => v.youtube_id).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { l1: string; l2: string };
}): Promise<Metadata> {
  const { l2 } = params;
  const lang = languageName(l2, 'en') || l2.toUpperCase();
  const videoIds = await getRecommendedIds(l2);

  const title = `Watch these awesome videos and learn ${lang}!`;
  const description = `Learn ${lang} naturally with authentic videos, interactive dual subtitles, built-in dictionary, and smart difficulty tracking on Language Player.`;

  let ogImage = `/og?emoji=%F0%9F%8E%AC`;
  if (videoIds.length > 0) {
    ogImage = `/og?videos=${videoIds.join(',')}&lang=${encodeURIComponent(lang)}`;
  }

  return {
    title,
    description,
    openGraph: {
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImage],
    },
  };
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
