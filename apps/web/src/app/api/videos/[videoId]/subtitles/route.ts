import { NextResponse } from 'next/server';
import { parseCSVSubtitles, syncLines } from '@/lib/subtitle-csv';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? 'https://directusvps.zerotohero.ca/zerotohero';

/** Map L2 code to Directus youtube_videos table suffix (from GO app). */
const TABLE_SUFFIX: Record<string, string> = {
  eu: '_2', vi: '_2',
  ko: '_3',
  zh: '_4',
  en: '_5',
  de: '_6',
  ja: '_7',
  fr: '_8',
  es: '_9', ca: '_9', ru: '_9',
  tr: '_10', pl: '_10', nl: '_10',
  he: '_11', pt: '_11', el: '_11', uk: '_11', cs: '_11', ar: '_11', sk: '_11', ms: '_11',
  it: '_12',
  id: '_13', sv: '_13', no: '_13', nan: '_13',
  th: '_14', my: '_14',
};

function getTableSuffix(l2: string): string {
  return TABLE_SUFFIX[l2] ?? '';
}

/** GET /api/videos/[videoId]/subtitles?l2=ja */
export async function GET(
  request: Request,
  { params }: { params: { videoId: string } },
) {
  const { searchParams } = new URL(request.url);
  const l2 = searchParams.get('l2') ?? 'en';
  const suffix = getTableSuffix(l2);
  const collection = `youtube_videos${suffix}`;

  try {
    // Directus 8 uses bracket notation for filters, not JSON
    const query = new URLSearchParams();
    query.set('filter[youtube_id][eq]', params.videoId);
    query.set('fields', 'subs_l2,subs_l1');
    query.set('limit', '1');

    const directusRes = await fetch(
      `${DIRECTUS_URL}/items/${collection}?${query}`,
    );

    if (!directusRes.ok) {
      console.error('Directus subtitle fetch failed:', directusRes.status);
      return NextResponse.json({ lines: [] });
    }

    const json = await directusRes.json();
    const record = json?.data?.[0] ?? json?.data;

    // subs_l2 and subs_l1 are CSV strings, not JSON arrays
    const l2Lines = parseCSVSubtitles(record?.subs_l2 ?? '');
    const l1Lines = parseCSVSubtitles(record?.subs_l1 ?? '');

    const lines = syncLines(l1Lines, l2Lines);

    return NextResponse.json({ lines });
  } catch (err) {
    console.error('Subtitle fetch error:', err);
    return NextResponse.json({ lines: [] });
  }
}
