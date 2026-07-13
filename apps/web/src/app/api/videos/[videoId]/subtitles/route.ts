import { NextResponse } from 'next/server';
import type { SubtitleLine } from '@langplayer/shared';

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
  return rows.slice(1)
    .map(row => {
      const fields = parseCSVRow(row);
      if (fields.length <= Math.max(timeIdx, lineIdx)) return null;
      const starttime = parseFloat(fields[timeIdx]!);
      const line = fields[lineIdx]!
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
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

/** Sync L1 and L2 subtitle lines by closest starttime. Ported from GO's syncLines(). */
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
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
    }
    if (bestIdx !== -1) {
      used.add(bestIdx);
      synced.push({ starttime: l1.starttime, l1Line: l1.line, l2Line: l2Lines[bestIdx]!.line });
    }
  }

  // Add remaining unmatched L2 lines
  for (let i = 0; i < l2Lines.length; i++) {
    if (!used.has(i)) {
      synced.push({ starttime: l2Lines[i]!.starttime, l1Line: '', l2Line: l2Lines[i]!.line });
    }
  }

  return synced.sort((a, b) => a.starttime - b.starttime);
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
