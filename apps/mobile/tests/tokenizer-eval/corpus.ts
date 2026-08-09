/**
 * TS port of SPEC-056's paragraph selection/normalization (run_eval.py).
 *
 * Keep behaviorally identical to scripts/tokenizer-eval/run_eval.py — the
 * two files intentionally mirror each other so both scorecards use the same
 * corpus slices.
 */

const CHARS_MODE = new Set(['zh', 'ja', 'ko', 'yue', 'th']);

/** Rough token/unit count: words for space-separated, chars for scriptio-continua. */
export function tokenUnits(text: string, l2: string): number {
  if (CHARS_MODE.has(l2)) return text.replace(/\s+/g, '').length;
  return text.split(/\s+/).filter(Boolean).length;
}

export function truncateToUnits(text: string, l2: string, maxUnits: number): string {
  if (CHARS_MODE.has(l2)) {
    const units = text.replace(/\s+/g, '');
    return units.length <= maxUnits ? text : units.slice(0, maxUnits);
  }
  const units = text.split(/\s+/).filter(Boolean);
  return units.length <= maxUnits ? text : units.slice(0, maxUnits).join(' ');
}

/** Strip Markdown markup so the tokenizer is tested on plain text. */
export function normalizeParagraph(text: string): string {
  let t = text;
  t = t.replace(/^#{1,6}\s+/, '');
  t = t.replace(/^>\s?/, '');
  t = t.replace(/^\s*[-*+]\s+/, '');
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  t = t.replace(/[*_`]/g, '');
  t = t.replace(/\\(.)/g, '$1');
  t = t.replace(/\u202f/g, ' ').replace(/\xa0/g, ' ');
  t = t.replace(/[ \t]+/g, ' ');
  return t.trim();
}

export function isParagraph(text: string): boolean {
  return !/^[#\-*|>]/.test(text.trimStart());
}

/**
 * Longest-paragraph selection with a per-language budget (default 200 units).
 * Mirrors run_eval.py §2.1.
 */
export function selectBlocks(md: string, l2: string, maxTokens = 200): string[] {
  const allBlocks = md
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const paragraphs = allBlocks
    .map(normalizeParagraph)
    .filter((p) => p.length > 0 && isParagraph(p));
  paragraphs.sort((a, b) => tokenUnits(b, l2) - tokenUnits(a, l2));

  const blocks: string[] = [];
  let budget = maxTokens;
  for (const p of paragraphs) {
    const n = tokenUnits(p, l2);
    if (n <= 0) continue;
    if (n <= budget) {
      blocks.push(p);
      budget -= n;
    } else {
      blocks.push(truncateToUnits(p, l2, budget));
      budget = 0;
      break;
    }
    if (budget <= 0) break;
  }
  if (blocks.length === 0 && allBlocks.length > 0) {
    blocks.push(normalizeParagraph(allBlocks[0]!));
  }
  return blocks;
}
