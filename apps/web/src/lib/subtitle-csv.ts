import type { SubtitleLine, SubtitleSyncedLine } from '@langplayer/shared';
import { parseSubtitleCSV } from '@langplayer/utils';

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
 * Delegates to the shared PapaParse-based parser in @langplayer/utils,
 * then applies Directus-specific HTML entity decoding on top.
 *
 * Multi-line subtitle text is stored as quoted CSV fields with literal newlines
 * inside the quotes. These are preserved as `\n` in the output line string,
 * matching how YouTube displays multi-line captions in a single segment.
 *
 * @returns Array of { starttime, line, duration? } objects, or empty array on failure.
 */
export function parseCSVSubtitles(csv: string): SubtitleLine[] {
  const lines = parseSubtitleCSV(csv);
  return lines.map((l) => ({
    ...l,
    line: decodeHTMLEntities(l.line),
  }));
}

// ── Subtitle line synchronization ────────────────────────────────────────

// Re-export from shared package — single source of truth.
// SubtitleSyncedLine is identical to the former local SyncedLine interface.
export type { SubtitleSyncedLine as SyncedLine } from '@langplayer/shared';

/**
 * Sync L1 and L2 subtitle lines by closest starttime using greedy
 * nearest-neighbor matching. Lines without a match in the other language
 * are still included (with an empty counterpart).
 *
 * @deprecated L1 subtitles (subs_l1) are no longer stored in Directus.
 *   This function is effectively a no-op — it wraps L2 lines as SyncedLine
 *   structs with empty l1Line. The pairing logic is dead code.
 *   Kept for backward compatibility with SubtitleDisplay's syncLines usage
 *   when matching progressively translated lines to L2 lines.
 *
 * Ported from the GO app's syncLines().
 */
export function syncLines(
  l1Lines: SubtitleLine[],
  l2Lines: SubtitleLine[],
): SubtitleSyncedLine[] {
  const l1Sorted = [...l1Lines].sort((a, b) => a.starttime - b.starttime);
  const l2Sorted = [...l2Lines].sort((a, b) => a.starttime - b.starttime);

  const synced: SubtitleSyncedLine[] = [];
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
        duration: l1.duration ?? l2Sorted[bestIdx]?.duration,
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
        duration: l2Sorted[i]?.duration,
        l1Line: '',
        l2Line: l2Sorted[i]!.line,
      });
    }
  }

  return synced.sort((a, b) => a.starttime - b.starttime);
}
