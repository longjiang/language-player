/**
 * SPEC-058 scoring — port of SPEC-056 §3.1 with offline adaptations:
 * - pronunciation only for languages the main-thread offline chain emits it
 *   (zh, ja, ko, ru, th, ar; yue is N/A — e2e covers the worker path).
 * - dictionary hit rate applies when an offline dict fixture exists,
 *   otherwise the criterion is excluded and weights renormalize.
 */

export const PRON_LANGS = new Set(['zh', 'ja', 'ko', 'ru', 'th', 'ar']);
export const DICT_SEG = new Set(['zh', 'yue', 'th']);

const WEIGHTS = {
  fidelity: 25,
  lemma_cov: 25,
  spot: 20,
  dict: 15,
  pron: 10,
  rel: 5,
} as const;

const GRADES: Array<[number, string]> = [
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

export interface EvalStats {
  blocks: number;
  tokens: number;
  uniqueContentTokens: number;
  reconstructionPct: number;
  avgContentTokenLen: number;
  lemmaCoverage: number;
  spotPassed: number;
  spotTotal: number;
  dictHitRate: number;
  pronunciationCoverage: number;
  errors: string[];
  avgBlockMs: number | null;
  p95BlockMs: number | null;
}

export interface EvalScore {
  scores: Record<string, number>;
  total: number;
  grade: string;
  applicable: string[];
}

export function computeScore(
  l2: string,
  stats: EvalStats,
  opts: { dictApplicable: boolean },
): EvalScore {
  const scores: Record<string, number> = {};
  scores.fidelity = stats.reconstructionPct;
  if (DICT_SEG.has(l2) && stats.avgContentTokenLen < 1.5) {
    scores.fidelity = Math.min(scores.fidelity, 50);
  }
  scores.lemma_cov = stats.lemmaCoverage * 100;
  scores.spot = stats.spotTotal > 0 ? (stats.spotPassed / stats.spotTotal) * 100 : 100;
  scores.rel =
    stats.errors.length === 0 &&
    (stats.avgBlockMs === null || stats.avgBlockMs < 2000)
      ? 100
      : 0;

  const applicable = ['fidelity', 'lemma_cov', 'spot', 'rel'];
  if (opts.dictApplicable) {
    scores.dict = Math.min(100, (stats.dictHitRate / 0.5) * 100);
    applicable.push('dict');
  }
  if (PRON_LANGS.has(l2)) {
    scores.pron = stats.pronunciationCoverage * 100;
    applicable.push('pron');
  }

  const totalWeight = applicable.reduce(
    (sum, k) => sum + WEIGHTS[k as keyof typeof WEIGHTS],
    0,
  );
  const total =
    applicable.reduce(
      (sum, k) => sum + scores[k]! * WEIGHTS[k as keyof typeof WEIGHTS],
      0,
    ) / totalWeight;
  const grade = GRADES.find(([threshold]) => total >= threshold)![1]!;
  return {
    scores,
    total: Math.round(total * 10) / 10,
    grade,
    applicable,
  };
}
