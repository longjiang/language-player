/**
 * SPEC-058 — Automated Mobile Offline Tokenization Evaluation Suite.
 *
 * Runs the 19 popular L2s through the production local fallback chain
 * (runLocalFallbackRaw + canonicalizeLocalTokens) on the pinned Wikipedia
 * corpus, scores each language, and writes a scorecard under
 * tmp/tokenizer-eval-mobile/results/.
 *
 * The WebView worker path is mocked to "not available" (e2e owns it); this
 * suite exercises the deterministic main-thread chain.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { POPULAR_L2S, TOKENIZER_CONFIG } from '@langplayer/shared';
import {
  canonicalizeLocalTokens,
  clearDictionaryCaches,
  resetTokenizer,
  runLocalFallbackRaw,
} from '../../lib/tokenizer';
import {
  CORPUS_ROOT,
  RESULTS_ROOT,
  hasDictFixture,
  hasKuromojiFixture,
  hasLemmaFixture,
  loadDictRows,
} from './fixtures';
import { selectBlocks } from './corpus';
import { computeScore, PRON_LANGS, type EvalStats } from './score';
import spotChecks from './spot-checks.json';

// ── Module mocks (data sources stand in for SQLite / RN loaders) ──
vi.mock('@/lib/tokenizer-db', async () => {
  const fixtures = await import('./fixtures');
  return {
    hasLemmaTable: async (l2: string) => fixtures.hasLemmaFixture(l2),
    lookupLemmasBatch: async (l2: string, words: string[]) =>
      fixtures.lookupLemmasBatch(l2, words),
    downloadLemmaTable: async () => {},
    hasKuromojiData: async (l2: string) => fixtures.hasKuromojiFixture(l2),
    getKuromojiDataPath: (l2: string) => fixtures.kuromojiFixtureDir(l2),
  };
});

vi.mock('@/lib/dictionary-db', async () => {
  const fixtures = await import('./fixtures');
  return {
    openOfflineDictionaryDB: async (l2: string) => fixtures.fakeDictionaryDb(l2),
    openDictionaryDB: async () => fixtures.fakeDictionaryDb('zh'),
    withDictionaryDbWrite: async (fn: () => Promise<void>) => fn(),
  };
});

vi.mock('@/lib/kuromoji-loader', async () => {
  const engines = await import('./engines');
  return { loadKuromoji: engines.loadKuromojiForEval };
});

vi.mock('@/lib/kuromoji-ko-loader', async () => {
  const engines = await import('./engines');
  return { loadKuromojiKo: engines.loadKuromojiKoForEval };
});

// ── Shared state ───────────────────────────────────────────────────
const languageResults: Record<string, any> = {};
const PUNCT_RE = /^[\p{P}\p{S}\s]+$/u;

function isContentToken(t: { text: string; lemmas: unknown[] }): boolean {
  return t.text.length > 0 && !PUNCT_RE.test(t.text) && t.lemmas.length > 0;
}

function p95(ms: number[]): number | null {
  if (ms.length === 0) return null;
  const sorted = [...ms].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.min(idx, sorted.length - 1)]!;
}

interface SpotCheck {
  sample: string;
  expected?: string;
  expectToken?: string;
  mode: 'lemma' | 'stem' | 'surface' | 'segment' | 'pron';
}

async function runSpotChecks(l2: string): Promise<{
  passed: number;
  total: number;
  details: Array<Record<string, unknown>>;
}> {
  const checks = (spotChecks as Record<string, SpotCheck[]>)[l2] ?? [];
  let passed = 0;
  const details: Array<Record<string, unknown>> = [];
  for (const spot of checks) {
    const detail: Record<string, unknown> = { ...spot, pass: false };
    try {
      const raw = await runLocalFallbackRaw(spot.sample, l2);
      const tokens = canonicalizeLocalTokens(raw, spot.sample);
      if (spot.mode === 'segment') {
        const ok = tokens.some(
          (t) => t.text === spot.expectToken && t.lemmas.length > 0,
        );
        detail.actual = tokens
          .filter((t) => t.lemmas.length > 0)
          .slice(0, 12)
          .map((t) => t.text)
          .join('|');
        detail.pass = ok;
      } else if (spot.mode === 'pron') {
        const hit = tokens.find(
          (t) => t.text === spot.sample && t.lemmas.length > 0,
        );
        const actual = hit?.pronunciation ?? null;
        detail.actual = actual;
        detail.pass = actual === spot.expected;
      } else {
        const hit =
          tokens.find((t) => t.text === spot.sample && t.lemmas.length > 0) ??
          tokens.find((t) => t.lemmas.length > 0);
        const actual = hit?.lemmas?.[0]?.lemma ?? null;
        detail.actual = actual;
        detail.pass = actual === spot.expected;
      }
    } catch (e) {
      detail.error = String((e as Error).message ?? e);
    }
    if (detail.pass) passed++;
    details.push(detail);
  }
  return { passed, total: checks.length, details };
}

async function runLanguage(l2: string): Promise<any> {
  clearDictionaryCaches(l2);
  resetTokenizer(l2);

  const corpusFile = path.join(CORPUS_ROOT, `${l2}.md`);
  const md = await readFile(corpusFile, 'utf8');
  const blocks = selectBlocks(md, l2, 200);
  const errors: string[] = [];
  const perBlockMs: number[] = [];
  const canonicalBlocks: Array<{ block: string; tokens: any[] }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const t0 = performance.now();
    let raw: any[];
    try {
      raw = await runLocalFallbackRaw(block, l2);
    } catch (e) {
      errors.push(`block ${i}: ${(e as Error).message ?? e}`);
      continue;
    }
    perBlockMs.push(performance.now() - t0);
    canonicalBlocks.push({ block, tokens: canonicalizeLocalTokens(raw, block) });
  }

  const content: any[] = [];
  let reconstructionExact = 0;
  for (const { block, tokens } of canonicalBlocks) {
    const joined = tokens.map((t) => t.text).join('');
    if (joined === block) reconstructionExact++;
    for (const t of tokens) if (isContentToken(t)) content.push(t);
  }

  const uniqueMap = new Map<string, any>();
  for (const t of content) if (!uniqueMap.has(t.text)) uniqueMap.set(t.text, t);
  const unique = [...uniqueMap.values()];

  const dictRows = await loadDictRows(l2);
  const dictSet = new Set(dictRows.map((r) => r.head));

  const spots = await runSpotChecks(l2);
  const sortedMs = [...perBlockMs].sort((a, b) => a - b);
  const stats: EvalStats = {
    blocks: canonicalBlocks.length,
    tokens: content.length,
    uniqueContentTokens: unique.length,
    reconstructionPct:
      canonicalBlocks.length > 0
        ? (reconstructionExact / canonicalBlocks.length) * 100
        : 0,
    avgContentTokenLen:
      content.length > 0
        ? content.reduce((a, t) => a + t.text.length, 0) / content.length
        : 0,
    lemmaCoverage:
      content.length > 0
        ? content.filter((t) => t.lemmas.length > 0).length / content.length
        : 0,
    spotPassed: spots.passed,
    spotTotal: spots.total,
    dictHitRate: unique.length > 0 ? unique.filter((t) => dictSet.has(t.text)).length / unique.length : 0,
    pronunciationCoverage:
      content.length > 0
        ? content.filter((t) => t.pronunciation).length / content.length
        : 0,
    errors,
    avgBlockMs:
      perBlockMs.length > 0
        ? Math.round((perBlockMs.reduce((a, b) => a + b, 0) / perBlockMs.length) * 10) / 10
        : null,
    p95BlockMs: p95(perBlockMs),
  };

  const dictApplicable = hasDictFixture(l2);
  const score = computeScore(l2, stats, { dictApplicable });
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as { sources?: Record<string, unknown> };

  const result = {
    l2,
    corpus: manifest.sources?.[l2] ?? {},
    blocks: canonicalBlocks.map(({ block, tokens }) => ({
      text: block,
      tokens,
    })),
    stats: {
      ...stats,
      p95BlockMs: stats.p95BlockMs !== null ? Math.round(stats.p95BlockMs * 10) / 10 : null,
      coldInitMs:
        perBlockMs.length > 0 && (TOKENIZER_CONFIG[l2]?.needsKuromoji || TOKENIZER_CONFIG[l2]?.needsDictSegmentation)
          ? Math.round(perBlockMs[0]!)
          : null,
    },
    spotChecks: spots.details,
    score,
  };
  languageResults[l2] = result;
  mkdirSync(RESULTS_ROOT, { recursive: true });
  writeFileSync(
    path.join(RESULTS_ROOT, `${l2}.json`),
    JSON.stringify(result, null, 2),
  );
  return result;
}

function knownNotes(l2: string, r: any): string {
  const notes: string[] = [];
  if (l2 === 'ar') notes.push('arabic-stem roots expected; SAMPA pronunciation');
  if (l2 === 'tr') notes.push('snowball stems expected, not dictionary lemmas');
  if (l2 === 'yue') notes.push('pronunciation N/A on main-thread (e2e covers worker)');
  if (['vi', 'hi', 'he'].includes(l2)) notes.push('surface-as-lemma expected');
  if (l2 === 'id') notes.push('Simplemma table only; affix coverage depends on table');
  if (PRON_LANGS.has(l2) && !hasDictFixture(l2) && l2 !== 'ar') {
    // no-op placeholder to keep structure
  }
  if (r.stats.errors.length > 0) notes.push(...r.stats.errors);
  if (!hasDictFixture(l2)) notes.push('dict criterion renormalized (no fixture)');
  return notes.join('; ');
}

describe('mobile offline tokenizer eval (SPEC-058)', () => {
  for (const l2 of POPULAR_L2S) {
    const missing: string[] = [];
    if (!existsSync(path.join(CORPUS_ROOT, `${l2}.md`))) missing.push('corpus');
    if (TOKENIZER_CONFIG[l2]?.hasLemmaTable && !hasLemmaFixture(l2)) {
      missing.push('lemma table');
    }
    if (TOKENIZER_CONFIG[l2]?.needsDictSegmentation && !hasDictFixture(l2)) {
      missing.push('dict fixture');
    }
    if (TOKENIZER_CONFIG[l2]?.needsKuromoji && !hasKuromojiFixture(l2)) {
      missing.push('kuromoji pack');
    }

    it.skipIf(missing.length > 0)(
      `${l2}${missing.length > 0 ? ` (skipped: ${missing.join(', ')})` : ''}`,
      async () => {
        const r = await runLanguage(l2);
        expect(r.stats.errors).toEqual([]);
        expect(r.stats.blocks).toBeGreaterThan(0);
      },
      120_000,
    );
  }

  afterAll(() => {
    const rows = Object.values(languageResults).map((r: any) => r);
    rows.sort((a, b) => b.score.total - a.score.total);
    const lines = [
      '# Mobile Offline Tokenizer Eval Scorecard (SPEC-058)',
      '',
      `Languages: ${rows.length}/${POPULAR_L2S.length} · main-thread chain, worker mocked (e2e owns it)`,
      '',
      '| L2 | Tokens | Lemma cov. | Spot | Dict hit | Pron. | p95 (ms) | Total | Grade | Notes |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ];
    for (const r of rows) {
      const s = r.stats;
      lines.push(
        `| ${r.l2} | ${s.tokens ?? 0} | ${(s.lemmaCoverage * 100).toFixed(0)}% | ` +
          `${s.spotPassed}/${s.spotTotal} | ` +
          `${(s.dictHitRate * 100).toFixed(0)}% | ` +
          `${(s.pronunciationCoverage * 100).toFixed(0)}% | ` +
          `${s.p95BlockMs ?? '—'} | ${r.score.total} | ${r.score.grade} | ${knownNotes(r.l2, r)} |`,
      );
    }
    const now = new Date().toISOString();
    mkdirSync(RESULTS_ROOT, { recursive: true });
    writeFileSync(path.join(RESULTS_ROOT, 'scorecard.md'), lines.join('\n') + '\n');
    writeFileSync(
      path.join(RESULTS_ROOT, 'scorecard.json'),
      JSON.stringify({ generated_at: now, languages: languageResults }, null, 2),
    );
  });
});
