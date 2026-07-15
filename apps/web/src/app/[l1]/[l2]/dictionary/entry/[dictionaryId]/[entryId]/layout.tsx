import type { Metadata } from 'next';
import { PYTHON_API_URL } from '@/lib/api-url';

interface EntryData {
  entry?: {
    head?: string;
    pronunciation?: string;
    definitions?: string[];
  };
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

export async function generateMetadata({
  params,
}: {
  params: { l1: string; l2: string; dictionaryId: string; entryId: string };
}): Promise<Metadata> {
  const { l1, l2, dictionaryId, entryId } = params;
  const id = decodeURIComponent(entryId).replace(/~/g, ',');
  const data = await getEntry(l2, dictionaryId, id, l1);
  const entry = data?.entry;

  const head = entry?.head?.trim() || 'Dictionary Entry';
  const def = entry?.definitions?.[0]?.trim() || '';
  const pron = entry?.pronunciation?.trim() || '';
  const title = pron ? `${head} (${pron})` : head;

  // Build OG image URL with entry info
  const ogParams = new URLSearchParams();
  ogParams.set('head', head);
  if (def) ogParams.set('def', def.length > 200 ? def.slice(0, 197) + '...' : def);
  if (pron) ogParams.set('pron', pron);
  const ogImage = `/og?${ogParams.toString()}`;

  return {
    title: `${title} — Dictionary`,
    description: def
      ? `${head}: ${def.slice(0, 160)}`
      : `Look up "${head}" in the Language Player dictionary.`,
    openGraph: {
      images: [{ url: ogImage, width: 1200, height: 630 }],
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
