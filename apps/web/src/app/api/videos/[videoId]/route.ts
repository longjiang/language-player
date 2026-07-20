import { NextResponse } from 'next/server';
import type { YouTubeVideo } from '@langplayer/shared';
import { parseCSVSubtitles, syncLines } from '@/lib/subtitle-csv';
import {
  fetchYouTubeL2Captions,
  fetchYouTubeL1Captions,
  fetchYouTubeMetadata,
} from '@/lib/video-service';

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

/** Parse ISO 8601 duration string (PT1H23M45S) into seconds. */
function parseDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseFloat(m[3] ?? '0');
}

/** GET /api/videos/[videoId]?l2=ja — video metadata + subtitles from Directus in one call */
export async function GET(
  request: Request,
  { params }: { params: { videoId: string } },
) {
  try {
    const { searchParams } = new URL(request.url);
    const l2 = searchParams.get('l2') ?? 'en';
    const suffix = getTableSuffix(l2);
    if (suffix === undefined) {
      return NextResponse.json({ error: `Unsupported L2: ${l2}` }, { status: 400 });
    }

    // Directus 8 bracket-notation filter
    const filterKey = `filter[youtube_id][eq]`;
    const fields = `youtube_id,id,title,l2,difficulty,lex_div,word_freq,views,likes,comments,duration,locale,tv_show,talk,date,tags,category,made_for_kids,subs_l1,subs_l2,channel_id`;

    const url = `${DIRECTUS_URL}/items/youtube_videos${suffix}?${filterKey}=${params.videoId}&fields=${fields}&limit=1`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 });
    }

    const json = await res.json();
    const item = json?.data?.[0] ?? json?.data ?? json?.[0] ?? null;

    if (!item) {
      // Video not in Directus — fetch captions + metadata from YouTube via Python backend
      const l1 = searchParams.get('l1') ?? 'en';

      const [metadata, l2Lines, l1Lines] = await Promise.all([
        fetchYouTubeMetadata(params.videoId),
        fetchYouTubeL2Captions(params.videoId, l2),
        fetchYouTubeL1Captions(params.videoId, l1, l2),
      ]);

      const syncedLines = syncLines(l1Lines, l2Lines);

      const video: YouTubeVideo = {
        youtube_id: params.videoId,
        id: '',
        title: metadata?.title ?? 'YouTube Video',
        channel_id: metadata?.channel_id,
        duration: metadata?.duration,
        views: metadata?.views,
        likes: metadata?.likes,
        comments: metadata?.comments,
        locale: metadata?.locale,
        subs_l1: l1Lines,
        subs_l2: l2Lines,
      };

      return NextResponse.json(
        { video, lines: syncedLines },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        },
      );
    }

    // Parse subtitles — fall back to Python/YouTube if Directus has no subs
    let l2Lines = parseCSVSubtitles(item.subs_l2 ?? '');
    let l1Lines = parseCSVSubtitles(item.subs_l1 ?? '');

    // Enrich sparse Directus records with YouTube data
    let youtubeMeta: Partial<YouTubeVideo> | null = null;
    if (l2Lines.length === 0 || !item.title || item.title === 'Untitled') {
      const l1 = searchParams.get('l1') ?? 'en';
      const [meta, fetchedL2, fetchedL1] = await Promise.all([
        fetchYouTubeMetadata(params.videoId),
        l2Lines.length === 0 ? fetchYouTubeL2Captions(params.videoId, l2) : Promise.resolve(l2Lines),
        l1Lines.length === 0 ? fetchYouTubeL1Captions(params.videoId, l1, l2) : Promise.resolve(l1Lines),
      ]);
      youtubeMeta = meta;
      l2Lines = fetchedL2;
      l1Lines = fetchedL1;
    }

    const syncedLines = syncLines(l1Lines, l2Lines);

    // Build video object — enrich sparse Directus fields with YouTube metadata
    const video: YouTubeVideo = {
      youtube_id: item.youtube_id || params.videoId,
      id: String(item.id ?? ''),
      title: (item.title && item.title !== 'Untitled' ? item.title : youtubeMeta?.title) ?? 'YouTube Video',
      difficulty: typeof item.difficulty === 'number' ? item.difficulty : undefined,
      duration: parseDuration(item.duration) ?? youtubeMeta?.duration,
      views: (typeof item.views === 'number' ? item.views : youtubeMeta?.views),
      likes: (typeof item.likes === 'number' ? item.likes : youtubeMeta?.likes),
      comments: (typeof item.comments === 'number' ? item.comments : youtubeMeta?.comments),
      locale: item.locale ?? youtubeMeta?.locale,
      tv_show: item.tv_show ? String(item.tv_show) : undefined,
      date: item.date ?? undefined,
      tags: item.tags ?? undefined,
      category: item.category ? String(item.category) : undefined,
      talk: item.talk ? String(item.talk) : undefined,
      channel_id: item.channel_id ?? youtubeMeta?.channel_id,
      subs_l1: l1Lines,
      subs_l2: l2Lines,
    };

    return NextResponse.json(
      { video, lines: syncedLines },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}
