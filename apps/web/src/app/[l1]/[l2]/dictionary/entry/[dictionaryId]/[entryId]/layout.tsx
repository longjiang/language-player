import type { Metadata } from 'next';
import { PYTHON_API_URL } from '@/lib/api-url';
import { languageName } from '@/lib/language-data';

interface EntryData {
  entry?: {
    head?: string;
    pronunciation?: string;
    definitions?: string[];
  };
}

interface SubsSearchResult {
  youtube_id: string;
}

async function getEntry(l2: string, dict: string, id: string, l1: string): Promise<EntryData | null> {
  try {
    const url = `${PYTHON_API_URL}/dictionary/entry?l2=${l2}&dict=${dict}&id=${encodeURIComponent(id)}&l1=${l1}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getFirstSubsVideo(term: string, l2: string): Promise<string | null> {
  try {
    const url = `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(term)}&l2=${l2}&limit=1&context=0`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const videos: SubsSearchResult[] = Array.isArray(data) ? data : data?.results ?? [];
    return videos[0]?.youtube_id ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { l1: string; l2: string; dictionaryId: string; entryId: string };
}): Promise<Metadata> {
  const { l1, l2, dictionaryId, entryId } = params;
  const id = decodeURIComponent(entryId).replace(/~/g, ',');
  const [entryData, videoId] = await Promise.all([
    getEntry(l2, dictionaryId, id, l1),
    getFirstSubsVideo(id.includes(',') ? id.split(',')[0]! : id, l2),
  ]);
  const entry = entryData?.entry;

  const head = entry?.head?.trim() || 'Dictionary Entry';
  const pron = entry?.pronunciation?.trim() || '';
  const headDisplay = pron ? `${head} (${pron})` : head;
  const l2Name = languageName(l2, l1) || l2.toUpperCase();
  const title = `See how ${headDisplay} is used in ${l2Name} videos!`;

  // Use first subs search video thumbnail, fall back to entry card OG
  const ogImage = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : `/og?head=${encodeURIComponent(head)}&pron=${encodeURIComponent(pron)}`;

  return {
    title,
    description: `Watch real ${l2Name} videos featuring the word "${headDisplay}" with interactive dual subtitles on Language Player.`,
    openGraph: {
      images: [{ url: ogImage, width: videoId ? 480 : 1200, height: videoId ? 360 : 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImage],
    },
  };
}

export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
