import { NextResponse } from 'next/server';
import type { YouTubeVideo, SubtitleLine } from '@langplayer/shared';

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

/** Parse Directus CSV subtitle data into SubtitleLine[].
 *  Uses the header row to find the "line" column index. */
function parseCSVSubtitles(csv: string): SubtitleLine[] {
  if (!csv || typeof csv !== 'string') return [];
  const rows = csv.trim().split('\n');
  if (rows.length < 2) return [];

  const header = rows[0]!.split(',');
  const lineIdx = header.findIndex((h) => h.trim().toLowerCase() === 'line');
  const timeIdx = header.findIndex((h) => h.trim().toLowerCase() === 'starttime');
  if (lineIdx === -1 || timeIdx === -1) return [];

  const dataRows = rows.slice(1);
  return dataRows
    .map(row => {
      const fields = parseCSVRow(row);
      if (fields.length <= Math.max(timeIdx, lineIdx)) return null;
      const line = fields[lineIdx]!
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      const starttime = parseFloat(fields[timeIdx]!);
      if (isNaN(starttime) || !line) return null;
      return { starttime, line };
    })
    .filter((x): x is SubtitleLine => x !== null);
}

/** Split a CSV row into fields, handling quoted values. */
function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '"') {
      if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

interface SyncedLine {
  starttime: number;
  l1Line: string;
  l2Line: string;
}

function syncLines(l1Lines: SubtitleLine[], l2Lines: SubtitleLine[]): SyncedLine[] {
  l1Lines = [...l1Lines].sort((a, b) => a.starttime - b.starttime);
  l2Lines = [...l2Lines].sort((a, b) => a.starttime - b.starttime);
  const synced: SyncedLine[] = [];
  const used = new Set<number>();
  for (const l1 of l1Lines) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < l2Lines.length; i++) {
      if (!used.has(i)) {
        const diff = Math.abs(l1.starttime - l2Lines[i]!.starttime);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
    }
    if (bestIdx !== -1) {
      used.add(bestIdx);
      synced.push({ starttime: l1.starttime, l1Line: l1.line, l2Line: l2Lines[bestIdx]!.line });
    }
  }
  for (let i = 0; i < l2Lines.length; i++) {
    if (!used.has(i)) {
      synced.push({ starttime: l2Lines[i]!.starttime, l1Line: '', l2Line: l2Lines[i]!.line });
    }
  }
  return synced.sort((a, b) => a.starttime - b.starttime);
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
    const res = await fetch(url);

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 });
    }

    const json = await res.json();
    const item = json?.data?.[0] ?? json?.data ?? json?.[0] ?? null;

    if (!item) {
      return NextResponse.json({
        youtube_id: params.videoId,
        title: 'YouTube Video',
      });
    }

    // Parse subtitles
    const l2Lines = parseCSVSubtitles(item.subs_l2 ?? '');
    const l1Lines = parseCSVSubtitles(item.subs_l1 ?? '');
    const syncedLines = syncLines(l1Lines, l2Lines);

    // Build video object — only fields in YouTubeVideo type
    const video: YouTubeVideo = {
      youtube_id: item.youtube_id,
      id: String(item.id ?? ''),
      title: item.title ?? 'Untitled',
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
      subs_l1: l1Lines,
      subs_l2: l2Lines,
    };

    return NextResponse.json({
      video,
      lines: syncedLines,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}
