import type { SubtitleLine } from '@langplayer/shared';

/** Parse the CSV subs_l2 format returned by the Python /subs-search endpoint.
 *  Uses the header row to find the "line" column index (follows Python
 *  reduce_video_subs_to_context which does csv_header.index('line')). */
export function parseSubsL2(csv: string): SubtitleLine[] {
  if (!csv) return [];
  const lines: SubtitleLine[] = [];
  const rows = csv.split('\n');
  if (rows.length < 2) return [];

  // Parse header to find the "line" column index
  const header = rows[0]!.split(',');
  const lineIdx = header.findIndex((h) => h.trim().toLowerCase() === 'line');
  const timeIdx = header.findIndex((h) => h.trim().toLowerCase() === 'starttime');
  if (lineIdx === -1 || timeIdx === -1) return [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.trim()) continue;

    // Parse CSV row splitting by comma, handling quoted fields
    const fields = _parseCSVRow(row);
    if (fields.length <= Math.max(timeIdx, lineIdx)) continue;

    const starttime = parseFloat(fields[timeIdx]!);
    if (isNaN(starttime)) continue;

    const line = fields[lineIdx]!.trim();
    if (!line) continue;

    lines.push({ starttime, line });
  }
  return lines;
}

/** Split a CSV row into fields, handling quoted values. */
export function _parseCSVRow(row: string): string[] {
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
