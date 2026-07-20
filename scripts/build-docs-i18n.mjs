#!/usr/bin/env node
/**
 * Build locale-specific docs JSON from English .md files + translations.csv.
 *
 * For each locale:
 *   1. Read every .md in content/docs/
 *   2. Replace {$key} → t(key, locale) using translations.csv
 *   3. Write apps/web/src/data/docs-i18n/{locale}.json
 *
 * Usage:
 *   node scripts/build-docs-i18n.mjs                    # all locales
 *   node scripts/build-docs-i18n.mjs --locale=zh-Hans   # single locale
 *   node scripts/build-docs-i18n.mjs --locale=zh-Hans --doc=media/explore  # single doc
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOCS_DIR = resolve(ROOT, 'apps/web/content/docs');
const OUT_DIR = resolve(ROOT, 'apps/web/src/data/docs-i18n');
const CSV_PATH = resolve(ROOT, 'translations.csv');

// ── Parse CSV ──────────────────────────────────────────────────────────

function parseCSV() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',');

  // Map: key → { en: '...', 'zh-Hans': '...', ... }
  /** @type {Record<string, Record<string, string>>} */
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const key = cols[0];
    if (!key) continue;
    /** @type {Record<string, string>} */
    const entry = {};
    for (let j = 0; j < headers.length; j++) {
      entry[headers[j]] = cols[j] ?? '';
    }
    map[key] = entry;
  }
  return map;
}

/** Naive CSV line parser — handles quoted fields containing commas. */
function parseCSVLine(line) {
  const cols = [];
  let col = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQuote) {
      inQuote = true;
    } else if (ch === '"' && inQuote && line[i + 1] === '"') {
      col += '"';
      i++;
    } else if (ch === '"' && inQuote) {
      inQuote = false;
    } else if (ch === ',' && !inQuote) {
      cols.push(col);
      col = '';
    } else {
      col += ch;
    }
  }
  cols.push(col);
  return cols;
}

// ── Walk docs ──────────────────────────────────────────────────────────

/** @typedef {{ slug: string; title: string; content: string }} DocEntry */

/** @param {string} dir @param {string} basePath @param {DocEntry[]} out */
function walkDocs(dir, basePath, out) {
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      walkDocs(fullPath, basePath ? `${basePath}/${item}` : item, out);
    } else if (item.endsWith('.md')) {
      const content = readFileSync(fullPath, 'utf-8');
      const match = content.match(/^# (.+)$/m);
      const slug = basePath ? `${basePath}/${item.replace(/\.md$/, '')}` : item.replace(/\.md$/, '');
      const title = match ? match[1] : item.replace(/\.md$/, '');
      out.push({ slug, title, content });
    }
  }
}

/** @returns {DocEntry[]} */
function getAllDocs() {
  /** @type {DocEntry[]} */
  const docs = [];
  walkDocs(DOCS_DIR, '', docs);
  // Sort: root docs first (alphabetical), then category docs
  docs.sort((a, b) => a.title.localeCompare(b.title));
  return docs;
}

// ── Resolve {$key} ─────────────────────────────────────────────────────

const KEY_RE = /\{\$([a-z0-9_.]+)\}/gi;

/**
 * Replace all {$key} in text with the locale's translation.
 * Falls back to the English value if locale not found.
 */
function resolveKeys(text, csv, locale) {
  return text.replace(KEY_RE, (_, key) => {
    const entry = csv[key];
    if (!entry) return `[?${key}]`;
    return entry[locale] || entry['en'] || `[?${key}]`;
  });
}

// ── Main ───────────────────────────────────────────────────────────────

const targetLocale = process.argv.find(a => a.startsWith('--locale='))?.split('=')[1];
const targetDoc = process.argv.find(a => a.startsWith('--doc='))?.split('=')[1];

const csv = parseCSV();
const allLocales = Object.keys(Object.values(csv)[0] ?? {}).filter(l => l !== 'key');
const locales = targetLocale ? [targetLocale] : allLocales;

const allDocs = getAllDocs();
const docs = targetDoc
  ? allDocs.filter(d => d.slug === targetDoc)
  : allDocs;

if (docs.length === 0) {
  console.error(`No docs found${targetDoc ? ` for "${targetDoc}"` : ''}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:5001';

for (const locale of locales) {
  const isEnglish = locale === 'en';

  const resolved = [];
  for (const doc of docs) {
    let content = doc.content;
    let title = doc.title;

    // Machine-translate body (non-English only). The translator's
    // placeholder protection keeps {$key} intact automatically.
    if (!isEnglish) {
      try {
        console.log(`  Translating ${doc.slug} to ${locale}…`);
        const resp = await fetch(`${API_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: content,
            l1: locale,
            l2: 'en',
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          content = data.translated_text;
        } else {
          console.warn(`  ⚠ Translation failed for ${doc.slug} (${resp.status}), using English`);
        }
      } catch (err) {
        console.warn(`  ⚠ Translation error for ${doc.slug}: ${err.message}, using English`);
      }
    }

    // Resolve {$key} with CSV translations
    resolved.push({
      slug: doc.slug,
      title: resolveKeys(title, csv, locale),
      content: resolveKeys(content, csv, locale),
    });
  }

  const outPath = resolve(OUT_DIR, `${locale}.json`);
  writeFileSync(outPath, JSON.stringify(resolved, null, 2), 'utf-8');
  console.log(`✓ ${outPath} (${resolved.length} docs)`);
}

console.log('Done.');
