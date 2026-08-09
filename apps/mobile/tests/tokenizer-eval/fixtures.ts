/**
 * SPEC-058 fixture access.
 *
 * Everything lives under tmp/tokenizer-eval-mobile/ (gitignored):
 *   - corpus/  — copied from the SPEC-056 corpus by prepare_fixtures.mjs
 *   - fixtures/ — lemma tables, dict headword lists, kuromoji packs
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const FIXTURES_ROOT = path.resolve(
  process.cwd(),
  'tmp/tokenizer-eval-mobile/fixtures',
);
export const CORPUS_ROOT = path.resolve(
  process.cwd(),
  'tmp/tokenizer-eval-mobile/corpus',
);
export const RESULTS_ROOT = path.resolve(
  process.cwd(),
  'tmp/tokenizer-eval-mobile/results',
);

export const lemmaFixturePath = (l2: string) =>
  path.join(FIXTURES_ROOT, 'lemmas', `${l2}.json`);
export const dictFixturePath = (l2: string) =>
  path.join(FIXTURES_ROOT, 'dicts', `${l2}.json`);
export const kuromojiFixtureDir = (l2: string) =>
  path.join(FIXTURES_ROOT, 'kuromoji', l2);

export function hasLemmaFixture(l2: string): boolean {
  return existsSync(lemmaFixturePath(l2));
}

export function hasDictFixture(l2: string): boolean {
  return existsSync(dictFixturePath(l2));
}

export function hasKuromojiFixture(l2: string): boolean {
  return existsSync(path.join(kuromojiFixtureDir(l2), 'base.dat.gz'));
}

/** Load a lemma table fixture ({surface: [lemma, ...]} JSON) as a Map. */
export async function loadLemmaTable(
  l2: string,
): Promise<Map<string, string[]> | null> {
  const p = lemmaFixturePath(l2);
  if (!existsSync(p)) return null;
  const obj = JSON.parse(await readFile(p, 'utf8')) as Record<string, string[]>;
  return new Map(Object.entries(obj));
}

/** Batch lookup against the fixture table (mirrors tokenizer-db's behavior). */
export async function lookupLemmasBatch(
  l2: string,
  words: string[],
): Promise<Map<string, string[]>> {
  const table = await loadLemmaTable(l2);
  const out = new Map<string, string[]>();
  if (!table) return out;
  for (const w of words) {
    const hit = table.get(w);
    if (hit) out.set(w, hit);
  }
  return out;
}

export interface DictFixtureRow {
  head: string;
  alternate: string | null;
  pronunciation: string | null;
  part_of_speech: string | null;
}

/**
 * Load dict fixture rows. Format is a compact array of [head, pronunciation]
 * (plus optional alternate/POS) pairs written by prepare_fixtures.mjs from the
 * server's NDJSON export. Alternate forms are expanded into their own head
 * rows — mirroring the production `head UNION alternate` query the app runs.
 */
export async function loadDictRows(l2: string): Promise<DictFixtureRow[]> {
  const p = dictFixturePath(l2);
  if (!existsSync(p)) return [];
  const rows = JSON.parse(await readFile(p, 'utf8')) as Array<
    [string, string | null, string | null, string | null]
  >;
  const out: DictFixtureRow[] = [];
  for (const [head, pronunciation, alternate, part_of_speech] of rows) {
    out.push({
      head,
      alternate: alternate ?? null,
      pronunciation: pronunciation ?? null,
      part_of_speech: part_of_speech ?? null,
    });
    // The app's loadDictWordSet() runs `head UNION alternate`, so alternates
    // must appear as their own headword rows for max-matching to see them.
    if (alternate) {
      out.push({
        head: alternate,
        alternate: null,
        pronunciation: pronunciation ?? null,
        part_of_speech: part_of_speech ?? null,
      });
    }
  }
  return out;
}

/**
 * Fake SQLite DB standing in for dictionary-db. The production
 * loadDictWordSet() probes several SELECT shapes — the fake ignores SQL and
 * returns the fixture rows for the requested language.
 */
export function fakeDictionaryDb(l2: string): {
  getAllAsync<T>(): Promise<T[]>;
} {
  return {
    getAllAsync: async <T>(): Promise<T[]> =>
      (await loadDictRows(l2)) as unknown as T[],
  };
}
