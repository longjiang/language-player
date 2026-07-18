import type { SubtitleLine } from '@langplayer/shared';

// ── Row-level CSV splitting ──────────────────────────────────────────────

/**
 * Split a CSV string into rows, respecting quoted fields that may contain
 * newlines. A newline inside double quotes is part of the field value, not
 * a row separator.
 *
 * Directus 8 stores multi-line subtitle text as quoted CSV fields:
 *   0.001,3.249,"-(앵커) 다음 소식입니다.\n하나님이 고수익을 보장한다며 서울"
 *
 * The original `split('\n')` approach broke these in half. This function
 * walks the string character-by-character to correctly identify row boundaries.
 */
function splitCSVRows(csv: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;

    if (ch === '"') {
      // Handle escaped quotes inside a quoted field: "" → literal "
      if (inQuotes && i + 1 < csv.length && csv[i + 1] === '"') {
        current += '""';
        i++; // skip the second quote
      } else {
        inQuotes = !inQuotes;
      }
      current += ch;
    } else if (ch === '\n' && !inQuotes) {
      // Newline outside quotes = row boundary
      rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  // Don't forget the last row
  if (current.length > 0) {
    rows.push(current);
  }

  return rows;
}

// ── Field-level CSV parsing ──────────────────────────────────────────────

/**
 * Split a single CSV row into individual fields, handling quoted values
 * (which may themselves contain commas or newlines).
 */
function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;

    if (ch === '"') {
      if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
        // Escaped quote: "" → literal "
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
  return fields.map(unquote);
}

/**
 * Strip surrounding double quotes and unescape internal "" → ".
 * The header row's `split(',')` leaves quotes on field names,
 * and `parseCSVRow` preserves them on quoted values.
 */
function unquote(field: string): string {
  if (field.length >= 2 && field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1).replace(/""/g, '"');
  }
  return field;
}

// ── HTML entity decoding ─────────────────────────────────────────────────

/**
 * Decode the HTML entities that Directus 8 encodes in CSV text fields.
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Parse Directus 8 CSV subtitle data into SubtitleLine[].
 *
 * The CSV has a header row with column names (starttime, duration, line, etc.).
 * The parser finds the "starttime" and "line" columns by name, then extracts
 * each data row.
 *
 * Multi-line subtitle text is stored as quoted CSV fields with literal newlines
 * inside the quotes. These are preserved as `\n` in the output line string,
 * matching how YouTube displays multi-line captions in a single segment.
 *
 * @returns Array of { starttime, line } objects, or empty array on failure.
 */
export function parseCSVSubtitles(csv: string): SubtitleLine[] {
  if (!csv || typeof csv !== 'string') return [];

  const rows = splitCSVRows(csv);
  if (rows.length < 2) return [];

  // Parse header row to find column indexes
  const headerFields = parseCSVRow(rows[0]!);
  const lineIdx = headerFields.findIndex(
    (h) => h.trim().toLowerCase() === 'line',
  );
  const timeIdx = headerFields.findIndex(
    (h) => h.trim().toLowerCase() === 'starttime',
  );
  if (lineIdx === -1 || timeIdx === -1) return [];

  const dataRows = rows.slice(1);
  const result: SubtitleLine[] = [];

  for (const row of dataRows) {
    // Skip empty rows
    if (!row.trim()) continue;

    const fields = parseCSVRow(row);
    if (fields.length <= Math.max(timeIdx, lineIdx)) continue;

    const starttime = parseFloat(fields[timeIdx]!);
    if (isNaN(starttime)) continue;

    const line = decodeHTMLEntities(fields[lineIdx]!).trim();
    if (!line) continue;

    result.push({ starttime, line });
  }

  return result;
}

// ── Subtitle line synchronization ────────────────────────────────────────

export interface SyncedLine {
  starttime: number;
  l1Line: string;
  l2Line: string;
}

/**
 * Sync L1 and L2 subtitle lines by closest starttime using greedy
 * nearest-neighbor matching. Lines without a match in the other language
 * are still included (with an empty counterpart).
 *
 * Ported from the GO app's syncLines().
 */
export function syncLines(
  l1Lines: SubtitleLine[],
  l2Lines: SubtitleLine[],
): SyncedLine[] {
  const l1Sorted = [...l1Lines].sort((a, b) => a.starttime - b.starttime);
  const l2Sorted = [...l2Lines].sort((a, b) => a.starttime - b.starttime);

  const synced: SyncedLine[] = [];
  const used = new Set<number>();

  for (const l1 of l1Sorted) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < l2Sorted.length; i++) {
      if (!used.has(i)) {
        const diff = Math.abs(l1.starttime - l2Sorted[i]!.starttime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
    }
    if (bestIdx !== -1) {
      used.add(bestIdx);
      synced.push({
        starttime: l1.starttime,
        l1Line: l1.line,
        l2Line: l2Sorted[bestIdx]!.line,
      });
    }
  }

  // Add remaining unmatched L2 lines
  for (let i = 0; i < l2Sorted.length; i++) {
    if (!used.has(i)) {
      synced.push({
        starttime: l2Sorted[i]!.starttime,
        l1Line: '',
        l2Line: l2Sorted[i]!.line,
      });
    }
  }

  return synced.sort((a, b) => a.starttime - b.starttime);
}
