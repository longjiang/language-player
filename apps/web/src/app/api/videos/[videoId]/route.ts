import { NextResponse } from 'next/server';
import type { YouTubeVideo, SubtitleLine } from '@langplayer/shared';
import type { SyncedLine } from '@/lib/subtitle-csv';
import { parseCSVSubtitles } from '@/lib/subtitle-csv';
import { PYTHON_API_URL } from '@/lib/api-url';
import { fetchYouTubeL2Captions } from '@/lib/video-service';

/** Parse duration into seconds — accepts ISO 8601 (PT1H23M45S) or a raw number.
 *  Directus videos come back as ISO strings; the YouTube fallback for imported
 *  videos returns seconds as a number. */
function parseDuration(iso: string | number | undefined): number | undefined {
  if (iso == null) return undefined;
  if (typeof iso === 'number') return iso;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseFloat(m[3] ?? '0');
}

/** GET /api/videos/[videoId]?l2=ja — video metadata + subtitles via Flask backend */
export async function GET(request: Request, props: { params: Promise<{ videoId: string }> }) {
  const params = await props.params;
  try {
    const { searchParams } = new URL(request.url);
    const l2 = searchParams.get('l2') ?? 'en';

    // Fetch via Flask backend (which proxies Directus + falls back to YouTube).
    // clean_generated=0 keeps auto-generated captions raw on the initial load
    // — SPEC-029 normalization is applied progressively on the client instead
    // of blocking the first paint on the whole LLM cleanup.
    const flaskRes = await fetch(
      `${PYTHON_API_URL}/videos?youtube_id=${params.videoId}&l2=${l2}&subs_l2=1&clean_generated=0`,
      { next: { revalidate: 3600 } },
    );

    if (!flaskRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 });
    }

    const flaskData = await flaskRes.json();
    const item = flaskData?.video;
    const isGenerated = flaskData?.isGenerated === true;

    if (!item) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Parse L2 subtitles — prefer Flask-parsed lines, fall back to CSV parsing
    let l2Lines: SubtitleLine[] = [];

    if (flaskData?.lines && Array.isArray(flaskData.lines)) {
      // Normalize Flask line shapes (YouTube fallback: {starttime, line};
      // /videos/subtitles: {starttime, duration, l1Line, l2Line})
      l2Lines = flaskData.lines.map((l: any) => ({
        starttime: l.starttime ?? 0,
        duration: l.duration,
        line: l.l2Line ?? l.line ?? '',
      }));
    } else if (item.subs_l2 && typeof item.subs_l2 === 'string') {
      l2Lines = parseCSVSubtitles(item.subs_l2);
    }

    // Wrap L2 lines as SyncedLine with empty L1 (translations come later via /translate_array)
    let syncedLines: SyncedLine[] = l2Lines.map((l) => ({
      starttime: l.starttime,
      duration: l.duration,
      l1Line: '',
      l2Line: l.line,
    }));

    // Imported video (not in our DB) or DB video without saved subs: the Flask
    // /videos response has no lines, so fetch captions from YouTube through the
    // captions endpoint (same best-locale logic Nuxt uses, server-side).
    if (syncedLines.length === 0) {
      const captions = await fetchYouTubeL2Captions(params.videoId, l2);
      syncedLines = captions.map((l) => ({
        starttime: l.starttime,
        duration: l.duration,
        l1Line: '',
        l2Line: l.line,
      }));
    }

    // Build video object
    const video: YouTubeVideo = {
      youtube_id: item.youtube_id || params.videoId,
      id: String(item.id ?? ''),
      title: item.title || 'YouTube Video',
      difficulty: typeof item.difficulty === 'number' ? item.difficulty : undefined,
      duration: parseDuration(item.duration),
      views: typeof item.views === 'number' ? item.views : undefined,
      likes: typeof item.likes === 'number' ? item.likes : undefined,
      comments: typeof item.comments === 'number' ? item.comments : undefined,
      locale: item.locale ?? undefined,
      tv_show: item.tv_show ? String(item.tv_show) : undefined,
      date: item.date ?? undefined,
      tags: item.tags ?? undefined,
      category: item.category ? String(item.category) : undefined,
      talk: item.talk ? String(item.talk) : undefined,
      channel_id: item.channel_id ?? undefined,
      // SPEC-010: native aspect ratio (width/height) from YouTube — lets the
      // player contain-fit non-16:9 videos instead of forcing a 16:9 box.
      aspect_ratio: typeof item.aspect_ratio === 'number' ? item.aspect_ratio : undefined,
      subs_l2: l2Lines,
    };

    return NextResponse.json(
      { video, lines: syncedLines, isGenerated },
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
