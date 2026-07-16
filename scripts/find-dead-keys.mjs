#!/usr/bin/env node
/**
 * Find translation keys in the CSV that are NOT referenced in the app source.
 *
 * READ-ONLY — never modifies files. You must manually confirm before deleting.
 *
 * Detects three key usage patterns:
 *   1. Static:       t('category.key')
 *   2. Template:     t(\`prefix.${dynamic}\`)  → keeps all CSV keys with that prefix
 *   3. Data-driven:  const NAV = [{ key: 'title.explore' }] ... t(link.key)
 *                    → scans for '.key' assignments in nav/config objects
 *
 * Plus a whitelist for dynamically-accessed keys (lang.*, level.*).
 *
 * Usage:
 *   node scripts/find-dead-keys.mjs           # list dead keys
 *   node scripts/find-dead-keys.mjs --test    # run self-tests + verify
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(ROOT, 'translations.csv');

// Scan all app source directories for t() key usage.
// The CSV is the single source of truth for the web app + future mobile app.
const SRC_DIRS = [
  resolve(ROOT, 'apps', 'web', 'src'),
  resolve(ROOT, 'language-player-3'),  // GO React Native app (may not exist yet)
].filter(d => { try { statSync(d); return true; } catch { return false; } });

// ── Whitelist ───────────────────────────────
const ALWAYS_KEEP = [
  'lang.',       // language names — accessed programmatically
  'level.',      // proficiency level maps — nested dicts
];

// ── Known-live keys for verification ────────
const MUST_BE_ALIVE = [
  // nav.* — used via t(\`nav.${group.label.toLowerCase()}\`)
  'nav.media', 'nav.vocab', 'nav.reading',
  // title.* — used via t(link.key) where link.key = 'title.explore' etc.
  'title.explore', 'title.dictionary', 'title.tv_shows', 'title.watch_history',
  'title.reader', 'title.saved_words', 'title.review', 'title.app_name',
  'title.settings', 'title.queue', 'title.transcript',
  // Common — used in both Web + GO apps
  'msg.loading', 'msg.no_results', 'action.save_word', 'action.back',
  'action.search', 'label.saved', 'error.entry_not_found',
  'placeholder.filter', 'placeholder.search_languages',
  'sort.most_viewed', 'a11y.next_line', 'a11y.play',
  // GO app — ContextRow, saved-words, etc.
  'action.cancel', 'action.copy', 'action.speak', 'action.clear_words',
  'msg.options', 'msg.choose_action', 'msg.no_saved_words',
  'title.saved_words',
  // Whitelisted prefixes
  'lang.ja', 'lang.zh', 'level.hsk', 'level.jlpt', 'level.cefr',
];

// ── 1. CSV keys ─────────────────────────────

function getCsvKeys() {
  const text = readFileSync(CSV_PATH, 'utf-8');
  const keys = new Set();
  for (const line of text.trim().split('\n').slice(1)) {
    const key = line.split(',')[0]?.trim();
    if (key) keys.add(key);
  }
  return keys;
}

// ── 2. Walk source ──────────────────────────

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }  // skip broken symlinks etc.
    if (st.isDirectory() && entry !== 'node_modules' && !entry.startsWith('.')) {
      yield* walk(full);
    } else if (st.isFile()) {
      const ext = extname(entry);
      if (ext === '.ts' || ext === '.tsx') yield full;
    }
  }
}

// ── 3. Extract keys from source ─────────────

function extractUsedKeys() {
  const staticKeys = new Set();
  const dynamicPrefixes = new Set();
  /** Keys referenced via data objects: { key: 'title.explore' } */
  const dataKeys = new Set();

  for (const srcDir of SRC_DIRS) {
    for (const file of walk(srcDir)) {
      const src = readFileSync(file, 'utf-8');

      // A: t('cat.key') or t("cat.key")
      for (const [, , key] of src.matchAll(/t\(\s*(['"])([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+)\1/g)) {
        staticKeys.add(key);
      }

      // B: t(\`prefix.${...}\`)  — template literal
      for (const [, prefix] of src.matchAll(/t\(\s*`([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\.\s*\$\{/g)) {
        if (prefix.length >= 2) dynamicPrefixes.add(prefix + '.');
      }

      // C: t('prefix.' + expr)  — string concat
      for (const [, , prefix] of src.matchAll(/t\(\s*(['"])([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\.\1\s*\+/g)) {
        if (prefix.length >= 2) dynamicPrefixes.add(prefix + '.');
      }

      // D: { key: 'category.key' }  — data-driven t(link.key) references
      for (const [, , key] of src.matchAll(/key:\s*(['"])([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+)\1/g)) {
        dataKeys.add(key);
      }
    }
  }

  return { staticKeys, dynamicPrefixes, dataKeys };
}

// ── 4. Dead key detection ───────────────────

function findDeadKeys() {
  const csvKeys = getCsvKeys();
  const { staticKeys, dynamicPrefixes, dataKeys } = extractUsedKeys();

  // Combine all detected keys into one alive set
  const aliveFromCode = new Set([
    ...staticKeys,
    ...dataKeys,
  ]);

  const dead = [];
  for (const key of csvKeys) {
    // Direct match (static or data-driven)
    if (aliveFromCode.has(key)) continue;
    // Dynamic prefix match
    if ([...dynamicPrefixes].some(p => key.startsWith(p))) continue;
    // Whitelist
    if (ALWAYS_KEEP.some(p => key.startsWith(p))) continue;
    dead.push(key);
  }

  return {
    dead: dead.sort(),
    alive: csvKeys.size - dead.length,
    total: csvKeys.size,
    staticKeys,
    dynamicPrefixes,
    dataKeys,
  };
}

// ── 5. Verification ─────────────────────────

function verify(result) {
  const aliveSet = new Set();
  for (const key of getCsvKeys()) {
    if (!result.dead.includes(key)) aliveSet.add(key);
  }

  const missing = MUST_BE_ALIVE.filter(k => !aliveSet.has(k));
  if (missing.length > 0) {
    console.log(`\n✗ VERIFICATION FAILED — ${missing.length} known-live keys marked dead:`);
    for (const k of missing) console.log(`    ${k}`);
    console.log('  The script is missing a usage pattern. Fix before deleting keys.');
    return false;
  }
  console.log(`\n✓ All ${MUST_BE_ALIVE.length} known-live keys verified alive.`);
  return true;
}

// ── 6. Self-tests ───────────────────────────

function runTests() {
  let passed = 0, failed = 0;
  const test = (name, fn) => {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
  };

  console.log('Unit tests:\n');

  // Static key regex
  const SK = /t\(\s*(['"])([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+)\1/g;
  test('static single-quoted', () => {
    const m = [..."t('msg.loading')".matchAll(SK)];
    if (m[0]?.[2] !== 'msg.loading') throw new Error('fail');
  });
  test('static double-quoted', () => {
    const m = [...'t("msg.loading")'.matchAll(SK)];
    if (m[0]?.[2] !== 'msg.loading') throw new Error('fail');
  });
  test('static with comma', () => {
    const m = [..."t('msg.loading', { n: 1 })".matchAll(SK)];
    if (m[0]?.[2] !== 'msg.loading') throw new Error('fail');
  });
  test('static followed by }', () => {
    const m = [..."t('msg.loading')}".matchAll(SK)];
    if (m[0]?.[2] !== 'msg.loading') throw new Error('fail');
  });

  // Template literal
  const TP = /t\(\s*`([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\.\s*\$\{/g;
  test('template nav prefix', () => {
    const m = [..."t(`nav.${x}`)".matchAll(TP)];
    if (m[0]?.[1] !== 'nav') throw new Error('fail');
  });

  // Data-driven: { key: 'title.explore' }
  const DK = /key:\s*(['"])([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+)\1/g;
  test('data-driven key property', () => {
    const m = [..."{ key: 'title.explore', href: 'explore' }".matchAll(DK)];
    if (m[0]?.[2] !== 'title.explore') throw new Error('fail');
  });
  test('data-driven double-quoted', () => {
    const m = [...'{ key: "title.explore" }'.matchAll(DK)];
    if (m[0]?.[2] !== 'title.explore') throw new Error('fail');
  });

  // Whitelist
  test('lang.ja whitelisted', () => {
    if (!ALWAYS_KEEP.some(p => 'lang.ja'.startsWith(p))) throw new Error('fail');
  });
  test('level.hsk whitelisted', () => {
    if (!ALWAYS_KEEP.some(p => 'level.hsk'.startsWith(p))) throw new Error('fail');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// ── CLI ─────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  const ok = runTests();
  if (!ok) process.exit(1);

  console.log('Integration test (--verify against real codebase):');
  const result = findDeadKeys();
  const vOk = verify(result);
  process.exit(vOk ? 0 : 1);
}

const result = findDeadKeys();

console.log(`Scanning: ${SRC_DIRS.length} source dir(s)`);
for (const d of SRC_DIRS) console.log(`  ${d}`);
console.log('');
console.log(`CSV keys:           ${result.total}`);
console.log(`Static t() calls:   ${result.staticKeys.size}`);
console.log(`Data-driven keys:   ${result.dataKeys.size}`);
console.log(`Dynamic prefixes:   ${result.dynamicPrefixes.size}`);
if (result.dynamicPrefixes.size > 0) {
  for (const p of [...result.dynamicPrefixes].sort()) {
    console.log(`  ${p}*`);
  }
}
console.log(`Whitelist prefixes: ${ALWAYS_KEEP.length}`);
console.log(`────────────────────────────`);
console.log(`Alive:              ${result.alive}`);
console.log(`Dead (removable):   ${result.dead.length}`);

if (args.includes('--verify')) {
  verify(result);
}

if (result.dead.length > 0) {
  // Group by category
  const byCat = {};
  for (const k of result.dead) {
    const cat = k.split('.')[0];
    (byCat[cat] ??= []).push(k);
  }
  console.log('\n⚠️  Dead keys by category (review before deleting):');
  for (const [cat, keys] of Object.entries(byCat).sort()) {
    console.log(`\n  ${cat} (${keys.length} keys):`);
    for (const k of keys) console.log(`    ${k}`);
  }
  console.log(`\n  Total dead keys: ${result.dead.length}`);
  console.log(`\n⚠️  To delete: manually remove these keys from translations.csv, then run:`);
  console.log('    node scripts/sync-translations.mjs csv-to-json');
} else {
  console.log('\n✓ No dead keys — CSV is clean.');
}
