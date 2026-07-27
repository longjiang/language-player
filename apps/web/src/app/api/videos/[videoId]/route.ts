import { NextResponse } from 'next/server';
import type { YouTubeVideo } from '@langplayer/shared';
import type { SyncedLine } from '@/lib/subtitle-csv';

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:5001';

/** Parse ISO 8601 duration string (PT1H23M45S) into seconds. */
function parseDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseFloat(m[3] ?? '0');
}

/** GET /api/videos/[videoId]?l2=ja — video metadata + subtitles via Flask backend */
export async function GET(
  request: Request,
  { params }: { params: { videoId: string } },
) {
  try {
    const { searchParams } = new URL(request.url);
    const l2 = searchParams.get('l2') ?? 'en';

    // Fetch via Flask backend (which proxies Directus + falls back to YouTube)
    const flaskRes = await fetch(
      `${PYTHON_API_URL}/videos?youtube_id=${params.videoId}&l2=${l2}&subs_l2=1`,
      { next: { revalidate: 3600 } },
    );

    if (!flaskRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 });
    }

    const flaskData = await flaskRes.json();
    const item = flaskData?.video;

    if (!item) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Parse L2 subtitles from Directus CSV (subs_l2 field) — or use lines if present
    let l2Lines: { starttime: number; duration: number; line: string }[] = [];

    if (flaskData?.lines && Array.isArray(flaskData.lines)) {
      l2Lines = flaskData.lines;
    } else if (item.subs_l2 && typeof item.subs_l2 === 'string') {
      // Parse CSV from Flask response
      const lines = item.subs_l2.split('\n').slice(1); // skip header
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',');
        if (parts.length >= 3) {
          l2Lines.push({
            starttime: parseFloat(parts[0]),
            duration: parseFloat(parts[1]),
            line: parts.slice(2).join(','),
          });
        }
      }
    }

    // Wrap L2 lines as SyncedLine with empty L1 (translations come later via /translate_array)
    const syncedLines: SyncedLine[] = l2Lines.map((l) => ({
      starttime: l.starttime,
      duration: l.duration,
      l1Line: '',
      l2Line: l.line,
    }));

    // Build video object
    const video: YouTubeVideo = {
      youtube_id: item.youtube_id || params.videoId,
      id: String(item.id ?? ''),
      title: item.title || 'YouTube Video',
      difficulty: typeof item.difficulty === 'number' ? item.difficulty : undefined,
      duration: parseDuration(item.duration) ?? item.duration,
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
