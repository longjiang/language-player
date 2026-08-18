import type { SubsSearchVideo } from '@langplayer/shared';
import { extractJsonObject, sanitizeJson, csvQuote } from './subs-ai-grouping';

/**
 * AI "Examples from Videos" (Let-DeepSeek-Explain follow-up) — shared by web
 * and mobile.
 *
 * Flow (orchestrated in the AiExplanation chat components):
 *   1. The client searches subtitles with `/subs-search?terms=<word>&l2=<l2>&limit=50&context=3`.
 *   2. The first AI_EXAMPLES_LIMIT results are serialized here into a compact
 *      CSV payload — each video contributes up to 3 lines around its matched
 *      line (matched line marked with a leading `*`).
 *   3. buildAiExamplesPrompt wraps the payload with the localized prose
 *      (`prompt.subs_ai_examples`) and a strict-JSON schema.
 *   4. The LLM replies with `{"examples": [{"video_id": <id>, "explanation": "<L1 text>"}]}`;
 *      parseAiExamplesResponse validates it. The client maps video ids back to
 *      the fetched results to render the example "chips".
 */

/** How many of the most-popular results are sent to the LLM. */
export const AI_EXAMPLES_LIMIT = 50;
/** Number of examples requested from the LLM (6-7). */
export const AI_EXAMPLES_TARGET = 7;
/** Context lines included around the matched line (matched ± CONTEXT = up to
 *  3 subtitle lines per video). */
export const AI_EXAMPLES_CONTEXT_LINES = 1;

/** One example returned by the LLM: a video id + the explanation. */
export interface AiVideoExample {
  videoId: number;
  explanation: string;
}

/** Parsed, validated LLM examples result. */
export interface AiExamplesResult {
  examples: AiVideoExample[];
}

/**
 * Serialize the first `limit` videos as the CSV payload for the examples
 * task. Each video contributes up to 3 lines around its matched line; the
 * matched line is marked with a leading `*` so the model knows which line
 * contains the term:
 *
 *   id,"line-before"
 *   id,"*matched-line"
 *   id,"line-after"
 *
 * Quoting follows buildAiPayload (subs-ai-grouping): `"` → `""`, `\` → `\\`,
 * literal newlines as `\n`/`\r`, so each record occupies one physical row.
 */
export function buildAiExamplesPayload(
  videos: SubsSearchVideo[],
  limit = AI_EXAMPLES_LIMIT,
): string {
  const rows: string[] = [];
  for (const v of videos.slice(0, limit)) {
    const m = v.matchLineIndex;
    const lines = v.subs_l2;
    if (m < 0) continue;
    const from = Math.max(0, m - AI_EXAMPLES_CONTEXT_LINES);
    const to = Math.min(lines.length - 1, m + AI_EXAMPLES_CONTEXT_LINES);
    for (let i = from; i <= to; i++) {
      const line = lines[i]?.line ?? '';
      rows.push(`${v.id},${csvQuote(i === m ? `*${line}` : line)}`);
    }
  }
  return ['id,"line"', ...rows].join('\n');
}

/**
 * Assemble the full LLM prompt: the localized intro prose (from
 * `prompt.subs_ai_examples`), the CSV payload, then the task + strict-JSON
 * schema + rules. The task/schema block stays in English (technical model
 * instructions, not user-facing UI).
 */
export function buildAiExamplesPrompt(opts: {
  /** Localized intro prose (contains {n}/{l2Name}/{term} already resolved). */
  prose: string;
  /** CSV payload produced by buildAiExamplesPayload. */
  lines: string;
  l1Name: string;
  l2Name: string;
  term: string;
}): string {
  const { prose, lines, l1Name, l2Name, term } = opts;
  return [
    prose,
    lines,
    `Pick ${AI_EXAMPLES_TARGET} of the videos above that best illustrate how the ${l2Name} word "${term}" is used. Then reply with ONLY strict JSON (no markdown, no commentary) in this exact shape:`,
    `{"examples": [{"video_id": <id>, "explanation": "<brief explanation in ${l1Name}>"}]}`,
    'Rules:',
    `- Lines marked with a leading "*" are the matched lines that contain "${term}".`,
    '- Choose 6 to 7 examples that show the most instructive or typical uses of the word.',
    `- "explanation" must be written in ${l1Name} and take 1-2 sentences. It should explain what the word means in that specific example, e.g. "In this example, っぽっち is used with も to mean 'not even a little'."`,
    '- Only use video ids from the input; never invent ids.',
    '- Never repeat the same video id twice.',
  ].join('\n\n');
}

function toId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

/**
 * Parse the LLM's reply into an {@link AiExamplesResult}. Tolerates markdown
 * code fences, surrounding prose, and trailing garbage after the JSON object;
 * validates the shape; returns `null` on malformed output (caller shows an
 * error state). Duplicate video ids are dropped, and the list is capped at
 * AI_EXAMPLES_TARGET entries.
 */
export function parseAiExamplesResponse(text: string): AiExamplesResult | null {
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
  const examples: AiVideoExample[] = [];
  const used = new Set<number>();
  if (Array.isArray(obj.examples)) {
    for (const e of obj.examples) {
      if (typeof e !== 'object' || e === null) continue;
      const eo = e as Record<string, unknown>;
      const videoId = toId(eo.video_id);
      const explanation = typeof eo.explanation === 'string' ? eo.explanation.trim() : '';
      if (videoId === undefined || !explanation) continue;
      if (used.has(videoId)) continue;
      used.add(videoId);
      examples.push({ videoId, explanation });
      if (examples.length >= AI_EXAMPLES_TARGET) break;
    }
  }

  if (examples.length === 0) return null;
  return { examples };
}
