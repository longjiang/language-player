import Papa from 'papaparse';
import type { SubtitleLine, VideoNote } from '@langplayer/shared';
import { decodeHtmlEntities } from './entities';

/**
 * Parse CSV subtitle data into SubtitleLine[] using PapaParse.
 *
 * Handles the CSV format returned by the Python /subs-search endpoint
 * and stored in Directus 8's `subs_l2` column. The CSV has a header row
 * with "starttime", optionally "duration", and "line" columns. Data rows
 * may have quoted line fields containing embedded newlines, commas, and
 * escaped double-quotes — all handled correctly by PapaParse.
 *
 * SPEC-091: decodes HTML entities (`&#39;` → `'`, double-encoded `&amp;#39;`
 * included) on the parsed `line` text. Since SPEC-091 the Flask endpoints
 * decode server-side; this idempotent pass is a safety net for the Chrome
 * extension and any consumer of raw DB CSV, and it's a no-op on already
 * decoded text.
 *
 * @param csv — Raw CSV string (header + data rows)
 * @returns Parsed subtitle lines, or [] if CSV is empty or malformed
 */
export function parseSubtitleCSV(csv: string): SubtitleLine[] {
  if (!csv) return [];

  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  if (result.errors.length > 0 && result.data.length === 0) return [];

  return result.data
    .map((row): SubtitleLine | null => {
      const starttime = parseFloat(row.starttime ?? '');
      if (isNaN(starttime)) return null;

      const line = decodeHtmlEntities((row.line ?? '').trim());
      if (!line) return null;

      const entry: SubtitleLine = { starttime, line };

      // Parse optional duration column
      if (row.duration) {
        const dur = parseFloat(row.duration);
        if (!isNaN(dur) && dur > 0) entry.duration = dur;
      }

      return entry;
    })
    .filter((l): l is SubtitleLine => l !== null);
}

/**
 * Parse the Directus/Supabase video `notes` column (a CSV of `id,note` rows)
 * into `VideoNote[]`. Mirrors the classic `$subs.parseNotes()`.
 *
 * @param csv — Raw CSV string (header + data rows), e.g.
 *   `"id,note\r\n1,酒德：饮酒的德性。\r\n2,大人：…"`
 * @returns Parsed notes (ids coerced to numbers), or [] if empty/malformed.
 */
export function parseNotes(csv?: string | null): VideoNote[] {
  if (!csv) return [];
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });
  if (result.errors.length > 0 && result.data.length === 0) return [];
  const notes: VideoNote[] = [];
  for (const row of result.data) {
    const id = Number(row.id ?? '');
    if (isNaN(id)) continue;
    const note = (row.note ?? '').trim();
    notes.push({ id, note });
  }
  return notes;
}

/**
 * Extract `[n]` note markers from a subtitle line, producing the marker-free
 * (clean) text plus the char offset of each marker in that clean text. The
 * offset lands on a token boundary once the clean text is tokenized, so a
 * badge can be drawn inline at the right place (SPEC-093).
 *
 * @param text — Raw subtitle line text, possibly containing `[n]` markers.
 * @returns `{ cleanText, markers }` where each marker has `{ id, index }`.
 */
export function extractNoteMarkers(text: string): {
  cleanText: string;
  markers: Array<{ id: number; index: number }>;
} {
  const markers: Array<{ id: number; index: number }> = [];
  if (!text || !text.includes('[')) return { cleanText: text ?? '', markers };
  let cleanText = '';
  let lastIndex = 0;
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = Number(m[1]);
    if (isNaN(id)) continue;
    cleanText += text.slice(lastIndex, m.index);
    markers.push({ id, index: cleanText.length });
    lastIndex = m.index + m[0].length;
  }
  cleanText += text.slice(lastIndex);
  return { cleanText, markers };
}

/**
 * Legacy alias for parseSubtitleCSV. Used by subs-search-results and
 * other components that imported the old name.
 * @deprecated Use parseSubtitleCSV instead.
 */
export const parseSubsL2 = parseSubtitleCSV;

/**
 * Legacy export — no longer needed (PapaParse handles field parsing).
 * @deprecated Use parseSubtitleCSV instead.
 */
export const _parseCSVRow = (_row: string): string[] => {
  const result = Papa.parse<string[]>(_row, { header: false });
  return result.data[0] ?? [];
};

/** Strip a leading timestamp prefix like "0.067," or "1.234, " from a line. */
export function stripTimestampPrefix(text: string): string {
  return text.replace(/^[\d.]+,\s*/, '');
}

/**
 * Find the index of the best-matching subtitle line for the given search term.
 * `term` may be comma-separated expanded forms (e.g. "食べる,食べます,食べた").
 */
export function findMatchLine(lines: SubtitleLine[], term: string): number {
  const terms = term.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return lines.findIndex((l) =>
    terms.some((t) => l.line.toLowerCase().includes(t)),
  );
}
