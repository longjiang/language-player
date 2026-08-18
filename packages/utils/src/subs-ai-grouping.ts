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
 * Flatten a validated grouping into display order over an arbitrary pool:
 * pattern groups (LLM order), then Other Patterns (analyzed ids the LLM didn't
 * assign to any pattern — including unmentioned leftovers), then everything
 * beyond the analyzed set in original order. Keeps exactly one copy of each id;
 * ids not present in `pool` are dropped.
 */
export function buildAiOrderedVideos<T extends { id: number }>(
  groups: AiGroupingResult,
  analyzed: T[],
  pool: T[],
): T[] {
  const byId = new Map(pool.map((v) => [v.id, v]));
  const used = new Set<number>();
  const ordered: T[] = [];
  const push = (id: number) => {
    if (used.has(id)) return;
    const v = byId.get(id);
    if (v) {
      ordered.push(v);
      used.add(id);
    }
  };
  for (const g of groups.patterns) {
    for (const id of g.videoIds) push(id);
  }
  for (const id of groups.otherIds) push(id);
  // Analyzed ids the LLM never mentioned → Other Patterns.
  for (const v of analyzed) push(v.id);
  // Beyond-analyzed videos → Other (original order).
  for (const v of pool) push(v.id);
  return ordered;
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
 * Extract the first complete, balanced JSON object from `text` (the substring
 * between the first `{` and the matching closing `}`), ignoring any trailing
 * garbage the model may have emitted after the object (e.g. a stray `]}`/`}`).
 * Returns `undefined` if no balanced object is found.
 */
function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/**
 * Repair common LLM-JSON corruption before parsing, in a single scan:
 *
 * 1. Stray punctuation glued onto numbers outside strings (e.g. `700000268?`
 *    → `700000268`) — the model often appends `?`/`!`/`！` to an id.
 * 2. Unescaped double quotes inside string values (e.g. `表示"纠缠的""`) — the
 *    model frequently writes literal quotes inside JSON strings. A quote is
 *    treated as a closing quote only when followed by `,` `}` `]` `:` or end
 *    of text (after whitespace); otherwise it's an interior quote and is
 *    escaped as `\"`.
 *
 * Only ever removes a stray char or adds `\` before a quote — never rewrites
 * valid JSON. Strings are scanned with backslash-escape awareness, so
 * already-escaped `\"` sequences are left alone.
 */
function sanitizeJson(text: string): string {
  let out = '';
  let inString = false;
  let prevWasDigit = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (ch === '\\') {
        // Copy the escaped char verbatim (e.g. \" or \\), then continue.
        if (i + 1 < text.length) {
          out += text[i + 1]!;
          i++;
        }
        continue;
      }
      if (ch === '"') {
        // Closing-quote heuristic: the next non-space char decides.
        let j = i + 1;
        while (
          j < text.length &&
          (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')
        ) {
          j++;
        }
        const next = text[j];
        if (j >= text.length || next === ',' || next === '}' || next === ']' || next === ':') {
          inString = false; // real closing quote
        } else {
          out = out.slice(0, -1) + '\\"'; // interior quote → escape it
        }
      }
      continue;
    }
    // Outside strings.
    if (ch === '"') {
      inString = true;
      out += ch;
      prevWasDigit = false;
      continue;
    }
    if (prevWasDigit && (ch === '?' || ch === '!' || ch === '！')) {
      prevWasDigit = false; // drop stray punctuation after a number
      continue;
    }
    out += ch;
    prevWasDigit = /\d/.test(ch);
  }
  return out;
}

/**
 * Parse the LLM's reply into an {@link AiGroupingResult}. Tolerates markdown
 * code fences, surrounding prose, and trailing garbage after the JSON object;
 * validates the shape; returns `null` on malformed output (caller falls back to
 * the default order).
 */
export function parseAiResponse(text: string): AiGroupingResult | null {
  let cleaned = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(cleaned);
  if (fence) cleaned = fence[1]!.trim();

  const json = extractJsonObject(cleaned);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitizeJson(json));
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
