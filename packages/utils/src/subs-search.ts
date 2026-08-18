import type { SubsSearchVideo } from '@langplayer/shared';

/**
 * Pure helpers for the subs-search results list (SPEC-082 Tasks 8/9/11),
 * shared by web and mobile so both devices filter, sort, and group
 * identically. No React/DOM/Node APIs.
 */

/** Sort keys supported by the results list. `'ai'` orders via the LLM
 *  grouping (computed in the caller; `applyFilterAndSort` keeps input order). */
export type SubsSearchSortKey =
  | 'views'
  | 'likes'
  | 'date'
  | 'length'
  | 'leftContext'
  | 'rightContext'
  | 'ai';

/** Convert an ISO 8601 duration (e.g. "PT6M52S", "PT1H30M", "P1DT2H3M4S") to
 *  seconds. Returns `undefined` for values that aren't parseable. Plain numbers
 *  (already in seconds) pass through unchanged. */
export function durationToSeconds(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const num = typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(num)) return num; // numeric string, e.g. "123"
  if (typeof value !== 'string') return undefined;
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!iso) return undefined;
  const d = Number(iso[1] ?? 0);
  const h = Number(iso[2] ?? 0);
  const m = Number(iso[3] ?? 0);
  const s = Number(iso[4] ?? 0);
  return ((d * 24 + h) * 60 + m) * 60 + s;
}

/** The character immediately before (side='left') or after (side='right') the
 *  first occurrence of `term` in a video's matched line. Empty string when the
 *  term is at the line edge. Used as the grouping key for left/right context sorts.
 *  `term` may be a comma-separated list of inflected forms (like the search
 *  term) — we match the earliest form that actually appears in the line. */
export function contextChar(
  video: SubsSearchVideo,
  term: string,
  side: 'left' | 'right',
): string {
  const line = video.subs_l2[video.matchLineIndex]?.line ?? '';
  const lower = line.toLowerCase();
  let idx = -1;
  let matchedLen = 0;
  for (const raw of term.split(',')) {
    const f = raw.trim().toLowerCase();
    if (!f) continue;
    const i = lower.indexOf(f);
    if (i >= 0 && (idx === -1 || i < idx)) {
      idx = i;
      matchedLen = f.length;
    }
  }
  if (idx < 0) return '';
  if (side === 'left') {
    return idx > 0 ? (line[idx - 1] ?? '') : '';
  }
  const after = idx + matchedLen;
  return after < line.length ? (line[after] ?? '') : '';
}

/** Grouping key fallback for rows whose term sits at the line edge (no
 *  boundary character) — every row must still belong to a group. */
export const CONTEXT_GROUP_PLACEHOLDER = '—';

/**
 * Shared filter+sort for the result list. Both the rendered list and the
 * player's prev/next queue use this, so the queue matches what's displayed.
 *
 * - `listSearch` narrows by title / subtitle line text.
 * - `listSort` orders by views, likes, date, matched-line length, or
 *   left/right context groups (largest group first, then boundary char
 *   alphabetical). `'ai'` keeps input order — the caller applies the LLM
 *   grouping separately.
 */
export function applyFilterAndSort(
  videos: SubsSearchVideo[],
  listSearch: string,
  listSort: SubsSearchSortKey,
  term: string,
): SubsSearchVideo[] {
  let result = [...videos];
  if (listSearch.trim()) {
    const q = listSearch.toLowerCase();
    result = result.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.subs_l2.some((l) => l.line.toLowerCase().includes(q)),
    );
  }

  const getMatchLine = (v: SubsSearchVideo) => v.subs_l2[v.matchLineIndex];

  // For left/right-context sorts, order groups by their size (descending) so
  // the biggest groups land at the top. Within a group, keep the boundary
  // character alphabetical for a stable, legible order.
  let contextCounts: Map<string, number> | undefined;
  if (listSort === 'leftContext' || listSort === 'rightContext') {
    const side = listSort === 'leftContext' ? 'left' : 'right';
    contextCounts = new Map();
    for (const v of result) {
      const key = contextChar(v, term, side) || CONTEXT_GROUP_PLACEHOLDER;
      contextCounts.set(key, (contextCounts.get(key) ?? 0) + 1);
    }
  }

  result.sort((a, b) => {
    switch (listSort) {
      case 'ai':
        // Ordering comes from the LLM grouping (applied in the component);
        // keep the input order here.
        return 0;
      case 'likes':
        return (b.views ?? 0) - (a.views ?? 0);
      case 'date':
        return new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime();
      case 'length': {
        const la = getMatchLine(a)?.line.length ?? 0;
        const lb = getMatchLine(b)?.line.length ?? 0;
        return la - lb;
      }
      case 'leftContext':
      case 'rightContext': {
        const side = listSort === 'leftContext' ? 'left' : 'right';
        const ka = contextChar(a, term, side) || CONTEXT_GROUP_PLACEHOLDER;
        const kb = contextChar(b, term, side) || CONTEXT_GROUP_PLACEHOLDER;
        // Largest group first, then alphabetical by boundary char.
        const diff = (contextCounts?.get(kb) ?? 0) - (contextCounts?.get(ka) ?? 0);
        if (diff !== 0) return diff;
        return ka.localeCompare(kb);
      }
      case 'views':
      default:
        return (b.views ?? 0) - (a.views ?? 0);
    }
  });

  return result;
}
