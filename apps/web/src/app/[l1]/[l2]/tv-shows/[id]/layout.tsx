import type { Metadata } from 'next';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateText } from '@/lib/translate';

interface TvShow {
  id: number;
  title: string;
}

async function getShow(id: number): Promise<TvShow | null> {
  try {
    const res = await fetch(`${PYTHON_API_URL}/tv-shows/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { l1: string; l2: string; id: string };
}): Promise<Metadata> {
  const showId = Number(params.id);
  const { l1, l2 } = params;
  const show = !isNaN(showId) ? await getShow(showId) : null;
  const rawTitle = show?.title || 'TV Show';
  const translatedTitle = await translateText(rawTitle, l1, l2);
  const title = `TV Show: ${translatedTitle}`;

  return {
    title,
    description: show?.title
      ? `Watch ${translatedTitle} with interactive dual subtitles on Language Player.`
      : 'Watch TV shows with interactive dual subtitles.',
    openGraph: {
      images: [{ url: `/og?emoji=%F0%9F%93%BA&title=${encodeURIComponent(title)}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`/og?emoji=%F0%9F%93%BA&title=${encodeURIComponent(title)}`],
    },
  };
}

export default function TvShowDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
