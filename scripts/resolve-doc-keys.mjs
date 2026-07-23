#!/usr/bin/env node
/**
 * Build docs-i18n JSON for one or all docs across ALL 31 locales.
 * Pure key resolution only — no machine translation (no Python needed).
 *
 * Usage:
 *   node scripts/resolve-doc-keys.mjs --doc=reading/epub
 *   node scripts/resolve-doc-keys.mjs                    # all docs
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

function parseCSVLine(line) {
  const cols = [];
  let col = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQuote) {
      inQuote = true;
    } else if (ch === '"' && inQuote && line[i + 1] === '"') {
      col += '"'; i++;
    } else if (ch === '"' && inQuote) {
      inQuote = false;
    } else if (ch === ',' && !inQuote) {
      cols.push(col); col = '';
    } else {
      col += ch;
    }
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
    for (let j = 0; j < headers.length; j++) {
      entry[headers[j]] = cols[j] ?? '';
    }
    map[key] = entry;
  }
  return { map, headers };
}

// ── Walk docs ──────────────────────────────────────────────────────────

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

// ── Key resolution ─────────────────────────────────────────────────────

const KEY_RE = /\{\$([a-z0-9_.]+)\}/gi;

function resolveKeys(text, csv, locale) {
  return text.replace(KEY_RE, (_, key) => {
    const entry = csv[key];
    if (!entry) return `[?${key}]`;
    return entry[locale] || entry['en'] || `[?${key}]`;
  });
}

// ── Main ───────────────────────────────────────────────────────────────

const targetDoc = process.argv.find(a => a.startsWith('--doc='))?.split('=')[1];

const { map: csv, headers } = parseCSV();
const locales = headers.filter(l => l !== 'key');

const allDocs = [];
walkDocs(DOCS_DIR, '', allDocs);
const docs = targetDoc
  ? allDocs.filter(d => d.slug === targetDoc)
  : allDocs;

if (docs.length === 0) {
  console.error(`No docs found${targetDoc ? ` for "${targetDoc}"` : ''}`);
  process.exit(1);
}

console.log(`Building for ${docs.length} doc(s) × ${locales.length} locales…`);

mkdirSync(OUT_DIR, { recursive: true });

for (const locale of locales) {
  const outPath = resolve(OUT_DIR, `${locale}.json`);

  // Load existing entries to merge
  let existing = [];
  try { existing = JSON.parse(readFileSync(outPath, 'utf-8')); } catch {}

  const bySlug = new Map(existing.map(e => [e.slug, e]));
  for (const doc of docs) {
    bySlug.set(doc.slug, {
      slug: doc.slug,
      title: resolveKeys(doc.title, csv, locale),
      content: resolveKeys(doc.content, csv, locale),
    });
  }

  const merged = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf-8');
}

console.log(`✓ Done. ${docs.length} doc(s) → ${locales.length} locale JSONs in ${OUT_DIR}`);
