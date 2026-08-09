#!/usr/bin/env node
/**
 * SPEC-058 fixture preparation.
 *
 * Generates the gitignored fixtures under tmp/tokenizer-eval-mobile/fixtures:
 *   - lemma tables from GET /lemmatization/export?l2=X&format=json
 *   - compact dictionary headword lists from
 *     GET /dictionary/download?l2=X&format=ndjson  ([head, pronunciation] pairs)
 *   - kuromoji/kuromoji-ko packs copied from node_modules (same .dat.gz files
 *     the app downloads from GET /lemmatization/download)
 *
 * The Flask server must already be running (repo rule: this script never
 * starts or stops it). The corpus is copied from the SPEC-056 corpus
 * (tmp/tokenizer-eval/corpus) when missing — same pinned articles, no
 * network fetch needed.
 *
 * Usage:
 *   node scripts/tokenizer-eval-mobile/prepare_fixtures.mjs          # idempotent
 *   node scripts/tokenizer-eval-mobile/prepare_fixtures.mjs --fresh  # re-download
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, 'tmp', 'tokenizer-eval-mobile', 'fixtures');
const BASE =
  process.env.PYTHON_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://127.0.0.1:5001';
const FRESH = process.argv.includes('--fresh');
const CORPUS_OUT = path.join(ROOT, 'tmp', 'tokenizer-eval-mobile', 'corpus');
const CORPUS_SRC = path.join(ROOT, 'tmp', 'tokenizer-eval', 'corpus');

const LEMMA_LANGS = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'id', 'ru'];
const DICT_LANGS = ['zh', 'yue', 'th'];
const KUR_LANGS = [
  ['ja', path.join(ROOT, 'node_modules', 'kuromoji', 'dict')],
  ['ko', path.join(ROOT, 'node_modules', 'kuromoji-ko', 'dict')],
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/**
 * Stream an NDJSON export and return compact rows:
 * [head, pronunciation, alternate, part_of_speech] — alternate/POS come from
 * the embedded entry_json (the app's precompiled DB has them as columns, and
 * loadDictWordSet() queries head UNION alternate).
 */
async function fetchNdjsonRows(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  if (!res.body) throw new Error(`${url} -> empty body`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const rows = [];
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let start = 0;
    let nl;
    while ((nl = buf.indexOf('\n', start)) >= 0) {
      const line = buf.slice(start, nl).trim();
      start = nl + 1;
      if (!line || line.startsWith('#')) continue;
      try {
        const row = JSON.parse(line);
        if (Array.isArray(row) && row[1]) {
          let alternate = null;
          let partOfSpeech = null;
          if (typeof row[3] === 'string' && row[3]) {
            try {
              const entry = JSON.parse(row[3]);
              alternate = entry.alternate ?? null;
              partOfSpeech = entry.part_of_speech ?? null;
            } catch {
              // entry_json not JSON — keep alternate/POS null.
            }
          }
          rows.push([row[1], row[2] ?? null, alternate, partOfSpeech]);
        }
      } catch {
        // Malformed line — skip (server metadata header is JSON, not an array).
      }
    }
    buf = buf.slice(start);
  }
  return rows;
}

async function prepareLemmaTables() {
  const outDir = path.join(FIXTURES, 'lemmas');
  mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const l2 of LEMMA_LANGS) {
    const out = path.join(outDir, `${l2}.json`);
    if (!FRESH && existsSync(out)) {
      summary.push(`  lemma ${l2}: cached`);
      continue;
    }
    const data = await fetchJson(
      `${BASE}/lemmatization/export?l2=${l2}&format=json`,
    );
    const table = data.table ?? data;
    await writeFile(out, JSON.stringify(table));
    summary.push(`  lemma ${l2}: ${Object.keys(table).length} rows`);
  }
  return summary;
}

async function prepareDictFixtures() {
  const outDir = path.join(FIXTURES, 'dicts');
  mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const l2 of DICT_LANGS) {
    const out = path.join(outDir, `${l2}.json`);
    if (!FRESH && existsSync(out)) {
      summary.push(`  dict ${l2}: cached`);
      continue;
    }
    const rows = await fetchNdjsonRows(
      `${BASE}/dictionary/download?l2=${l2}&format=ndjson`,
    );
    await writeFile(out, JSON.stringify(rows));
    summary.push(`  dict ${l2}: ${rows.length} heads`);
  }
  return summary;
}

function prepareKuromojiPacks() {
  const summary = [];
  for (const [l2, src] of KUR_LANGS) {
    const out = path.join(FIXTURES, 'kuromoji', l2);
    if (!FRESH && existsSync(path.join(out, 'base.dat.gz'))) {
      summary.push(`  kuromoji ${l2}: cached`);
      continue;
    }
    if (!existsSync(src)) {
      summary.push(`  kuromoji ${l2}: SKIP (source missing: ${src})`);
      continue;
    }
    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(src)) {
      cpSync(path.join(src, f), path.join(out, f));
    }
    summary.push(`  kuromoji ${l2}: copied ${readdirSync(out).length} files`);
  }
  return summary;
}

function ensureCorpus() {
  if (existsSync(path.join(CORPUS_OUT, 'manifest.json'))) return ['  corpus: cached'];
  if (!existsSync(path.join(CORPUS_SRC, 'manifest.json'))) {
    return ['  corpus: SKIP (SPEC-056 corpus missing — run scripts/tokenizer-eval/fetch_corpus.py)'];
  }
  mkdirSync(CORPUS_OUT, { recursive: true });
  for (const f of readdirSync(CORPUS_SRC)) {
    cpSync(path.join(CORPUS_SRC, f), path.join(CORPUS_OUT, f));
  }
  return [`  corpus: copied ${readdirSync(CORPUS_OUT).length} files`];
}

console.log(`[fixtures] base: ${BASE}`);
console.log(`[fixtures] dir: ${FIXTURES}`);
const lines = [
  ...ensureCorpus(),
  ...(await prepareLemmaTables()),
  ...(await prepareDictFixtures()),
  ...prepareKuromojiPacks(),
];
for (const line of lines) console.log(line);

// Exit non-zero if any expected fixture is missing.
const missing = [];
for (const l2 of LEMMA_LANGS) {
  if (!existsSync(path.join(FIXTURES, 'lemmas', `${l2}.json`))) {
    missing.push(`lemma ${l2}`);
  }
}
for (const l2 of DICT_LANGS) {
  if (!existsSync(path.join(FIXTURES, 'dicts', `${l2}.json`))) {
    missing.push(`dict ${l2}`);
  }
}
for (const [l2] of KUR_LANGS) {
  if (!existsSync(path.join(FIXTURES, 'kuromoji', l2, 'base.dat.gz'))) {
    missing.push(`kuromoji ${l2}`);
  }
}
if (missing.length > 0) {
  console.error(`[fixtures] MISSING: ${missing.join(', ')}`);
  process.exit(1);
}
if (!existsSync(path.join(CORPUS_OUT, 'manifest.json'))) {
  console.error('[fixtures] MISSING: corpus snapshot');
  process.exit(1);
}
console.log('[fixtures] all expected fixtures present');
