#!/usr/bin/env node
/**
 * Rebuild docs-i18n JSONs for a single doc across ALL 31 locales.
 *
 * Requires Node.js >= 20 (for stable fetch API).
 *
 * Usage:
 *   nvm use 22
 *   node scripts/rebuild-doc.mjs <path-to-md>
 *   node scripts/rebuild-doc.mjs apps/web/content/docs/media/explore.md
 *
 * What it does:
 *   1. Resolves {$key} from translations.csv for every locale (always).
 *   2. If the Python /translate server is reachable, machine-translates
 *      the body text too. Falls back to English silently if not.
 *   3. Merges the result into the existing docs-i18n/{locale}.json files.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// Node 18's experimental fetch can't resolve localhost — require >= 20
const major = parseInt(process.version.slice(1).split('.')[0]);
if (major < 20) {
  console.error(`⚠ Node ${process.version} — fetch may not work. Use Node >= 20 (nvm use 22).`);
  console.error('   Continuing with key resolution only.\n');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOCS_DIR = resolve(ROOT, 'apps/web/content/docs');
const OUT_DIR = resolve(ROOT, 'apps/web/src/data/docs-i18n');
const CSV_PATH = resolve(ROOT, 'translations.csv');
const API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';

// ── Parse CSV ──────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const cols = [];
  let col = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQuote) { inQuote = true; }
    else if (ch === '"' && inQuote && line[i + 1] === '"') { col += '"'; i++; }
    else if (ch === '"' && inQuote) { inQuote = false; }
    else if (ch === ',' && !inQuote) { cols.push(col); col = ''; }
    else { col += ch; }
  }
  cols.push(col);
  return cols;
}

function parseCSV() {
  const raw = readFileSync(CSV_PATH, 'utf-8').replace(/\r/g, '');
  const lines = raw.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const key = cols[0];
    if (!key) continue;
    const entry = {};
    for (let j = 0; j < headers.length; j++) entry[headers[j]] = cols[j] ?? '';
    map[key] = entry;
  }
  return { map, headers };
}

// ── Key resolution ─────────────────────────────────────────────────────

const KEY_RE = /\{\$([a-z0-9_.]+)\}/gi;

function resolveKeys(text, csv, locale) {
  return text.replace(KEY_RE, (_, key) => {
    const entry = csv[key];
    if (!entry) return `[?${key}]`;
    return entry[locale] || entry['en'] || `[?${key}]`;
  });
}

// ── Derive slug from path ──────────────────────────────────────────────

function docSlug(filePath) {
  const abs = resolve(filePath);
  const docsAbs = resolve(DOCS_DIR);
  let rel = relative(docsAbs, abs);
  if (rel.startsWith('..')) {
    // Try relative to cwd
    rel = relative(docsAbs, resolve(process.cwd(), filePath));
  }
  return rel.replace(/\.md$/, '').replace(/\\/g, '/');
}

// ── Main ───────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/rebuild-doc.mjs <path-to-md>');
  console.error('Example: node scripts/rebuild-doc.mjs apps/web/content/docs/media/explore.md');
  process.exit(1);
}

const absPath = resolve(filePath);
let md;
try { md = readFileSync(absPath, 'utf-8'); }
catch {
  // Try relative to DOCS_DIR
  const alt = resolve(DOCS_DIR, filePath);
  try { md = readFileSync(alt, 'utf-8'); }
  catch {
    console.error(`Cannot read: ${filePath} (tried ${absPath}, ${alt})`);
    process.exit(1);
  }
}

const slug = docSlug(absPath);
const titleMatch = md.match(/^# (.+)$/m);
const title = titleMatch ? titleMatch[1] : basename(filePath, '.md');

const { map: csv, headers } = parseCSV();
const locales = headers.filter(l => l !== 'key');

console.log(`\n📄 ${slug}`);
console.log(`   Title: "${title}"`);
console.log(`   Building for ${locales.length} locales…\n`);

mkdirSync(OUT_DIR, { recursive: true });

const canFetch = major >= 20;
let translated = 0;

let idx = 0;
const hasKeys = KEY_RE.test(title);
KEY_RE.lastIndex = 0; // reset regex

for (const locale of locales) {
  idx++;
  const isEnglish = locale === 'en';
  let content = md;
  let docTitle = title;
  let method = '🗝';

  // Machine-translate body and plain-text title for non-English
  if (!isEnglish && canFetch) {
    try {
      const resp = await fetch(`${API_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, l1: locale, l2: 'en' }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const data = await resp.json();
        content = data.translated_text;
        translated++;
        method = '🌐';
        // Also translate the title if it's plain text (no {$key})
        if (!hasKeys) {
          const titleResp = await fetch(`${API_URL}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: title, l1: locale, l2: 'en' }),
            signal: AbortSignal.timeout(15000),
          });
          if (titleResp.ok) {
            const titleData = await titleResp.json();
            docTitle = titleData.translated_text;
          }
        }
      }
    } catch {
      // Per-locale failure — server might be rate-limiting, try next locale
    }
  }

  // Resolve {$key} with CSV translations
  const entry = {
    slug,
    title: resolveKeys(docTitle, csv, locale),
    content: resolveKeys(content, csv, locale),
  };

  // Merge into existing locale JSON
  const outPath = resolve(OUT_DIR, `${locale}.json`);
  let existing = [];
  try { existing = JSON.parse(readFileSync(outPath, 'utf-8')); } catch {}
  const bySlug = new Map(existing.map(e => [e.slug, e]));
  bySlug.set(slug, entry);
  const merged = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf-8');

  process.stdout.write(`  ${method} ${String(idx).padStart(2)}/${locales.length}  ${locale.padEnd(9)} → ${entry.title.slice(0, 40)}\n`);
}

const summary = translated > 0
  ? `${translated} machine-translated`
  : 'key resolution only (no translate server)';
console.log(`✓ Done (${summary}) → ${OUT_DIR}/`);
