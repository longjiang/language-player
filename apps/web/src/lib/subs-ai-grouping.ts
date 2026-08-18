import type { SubsSearchVideo } from '@langplayer/shared';

/** How many of the most-popular results are sent to the LLM for analysis. */
export const AI_ANALYZE_LIMIT = 50;

/** One meaning/syntax-pattern group returned by the LLM. */
export interface AiPatternGroup {
  /** The group's display title — must be written in L1 by the LLM. */
  heading: string;
  /** The grammar pattern, written in L2 (e.g. "noun + っぽっち + も + negative"). */
  pattern: string;
  /** Video ids whose matched line uses this pattern. */
  videoIds: number[];
}

/** Parsed, validated LLM grouping result. */
export interface AiGroupingResult {
  patterns: AiPatternGroup[];
  /** Ids of analyzed videos that didn't fit any pattern → "Other Patterns". */
  otherIds: number[];
}

/**
 * Serialize the first `limit` videos as the two-column CSV payload described
 * in SPEC-081 ("CSV Payload Format"):
 *
 *   id,"line"
 *   20418,"今未練なんかこれっぽっちも無い"
 *
 * - `id` is the bare numeric video id (same id used for row keys / player).
 * - `line` is the matched L2 subtitle line, always double-quoted.
 * - Inside the quoted field: `"` → `""`, `\` → `\\`, and literal newline /
 *   carriage-return are written as the two-character sequences `\n` / `\r`
 *   so each record occupies exactly one physical row (they are preserved,
 *   not lost). `<br>` stays as-is.
 */
export function buildAiPayload(videos: SubsSearchVideo[], limit = AI_ANALYZE_LIMIT): string {
  const rows = videos.slice(0, limit).map((v) => {
    const line = v.subs_l2[v.matchLineIndex]?.line ?? '';
    return `${v.id},${csvQuote(line)}`;
  });
  return ['id,"line"', ...rows].join('\n');
}

function csvQuote(line: string): string {
  let s = line;
  s = s.replace(/\\/g, '\\\\');
  s = s.replace(/\r/g, '\\r');
  s = s.replace(/\n/g, '\\n');
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

/**
 * Assemble the full LLM prompt: the localized intro prose (from
 * `prompt.subs_ai_group`), the CSV payload, then the task + strict-JSON
 * schema + rules. The task/schema block stays in English (technical model
 * instructions, not user-facing UI).
 */
export function buildAiPrompt(opts: {
  /** Localized intro prose (contains {n}/{l2Name}/{term} already resolved). */
  prose: string;
  /** CSV payload produced by buildAiPayload. */
  lines: string;
  l1Name: string;
  l2Name: string;
  term: string;
}): string {
  const { prose, lines, l1Name, l2Name, term } = opts;
  return [
    prose,
    lines,
    `Identify the distinct meanings and syntax patterns of "${term}" across these lines. Group the line ids by meaning/pattern. Then reply with ONLY strict JSON (no markdown, no commentary) in this exact shape:`,
    `{"patterns": [{"heading": "<meaning in ${l1Name}>", "pattern": "<syntax pattern, written in ${l2Name} with placeholders>", "video_ids": [<ids>]}], "other_ids": [<ids>]}`,
    'Rules:',
    `- "heading" must be in ${l1Name}; it is the group's display title, e.g. "Not even a little bit" for っぽっち.`,
    `- "pattern" describes the grammar in ${l2Name}, e.g. "noun + っぽっち + も + negative".`,
    '- Return at most 6 patterns. If two patterns are the same grammar written differently, merge them into one group.',
    '- Every input id must appear exactly once: in exactly one pattern\'s "video_ids" or in "other_ids" — never in both, never repeated across patterns.',
    '- Lines that don\'t fit any clear pattern go to "other_ids".',
    '- Order patterns from most common to least common.',
    '- Never invent ids; only use ids from the input.',
  ].join('\n\n');
}

function toIds(values: unknown[]): number[] {
  return values
    .filter(
      (x): x is number | string =>
        (typeof x === 'number' && Number.isFinite(x)) ||
        (typeof x === 'string' && /^\d+$/.test(x.trim())),
    )
    .map((x) => Number(x));
}

/**
 * Parse the LLM's reply into an {@link AiGroupingResult}. Tolerates markdown
 * code fences and surrounding prose; validates the shape; returns `null` on
 * malformed output (caller falls back to the default order).
 */
export function parseAiResponse(text: string): AiGroupingResult | null {
  let cleaned = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(cleaned);
  if (fence) cleaned = fence[1]!.trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const patterns: AiPatternGroup[] = [];
  if (Array.isArray(obj.patterns)) {
    for (const p of obj.patterns) {
      if (typeof p !== 'object' || p === null) continue;
      const po = p as Record<string, unknown>;
      const heading = typeof po.heading === 'string' ? po.heading.trim() : '';
      const pattern = typeof po.pattern === 'string' ? po.pattern.trim() : '';
      const videoIds = Array.isArray(po.video_ids) ? toIds(po.video_ids) : [];
      if (heading) patterns.push({ heading, pattern, videoIds });
    }
  }
  const otherIds = Array.isArray(obj.other_ids) ? toIds(obj.other_ids) : [];

  // The LLM sometimes repeats ids across patterns or puts an id in both a
  // pattern and other_ids. Sanitize: each id is kept only in its FIRST
  // pattern; other_ids keeps only ids not already assigned to a pattern.
  const used = new Set<number>();
  const cleanPatterns: AiPatternGroup[] = [];
  for (const p of patterns) {
    const videoIds: number[] = [];
    for (const id of p.videoIds) {
      if (used.has(id)) continue;
      used.add(id);
      videoIds.push(id);
    }
    if (videoIds.length > 0) cleanPatterns.push({ heading: p.heading, pattern: p.pattern, videoIds });
  }
  const cleanOther: number[] = [];
  for (const id of otherIds) {
    if (used.has(id)) continue;
    used.add(id);
    cleanOther.push(id);
  }

  if (cleanPatterns.length === 0 && cleanOther.length === 0) return null;
  return { patterns: cleanPatterns, otherIds: cleanOther };
}
