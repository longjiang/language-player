#!/usr/bin/env node
/**
 * Bidirectional translation sync: CSV ↔ locale JSONs.
 *
 * Usage:
 *   node scripts/sync-translations.mjs csv-to-json   # CSV → all locale JSONs
 *   node scripts/sync-translations.mjs json-to-csv   # all locale JSONs → CSV
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MESSAGES_DIR = resolve(ROOT, 'apps', 'web', 'messages');
const CSV_PATH = resolve(ROOT, 'translations.csv');

// ── Locale discovery ────────────────────────

const PRIORITY = ['en', 'zh-Hans', 'zh-Hant'];
const LOCALES = (() => {
  const all = readdirSync(MESSAGES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort();
  return [...PRIORITY.filter(l => all.includes(l)), ...all.filter(l => !PRIORITY.includes(l))];
})();

// ── Helpers ─────────────────────────────────

function loadLocales() {
  /** @type {Record<string, Record<string, unknown>>} */
  const data = {};
  for (const loc of LOCALES) {
    data[loc] = JSON.parse(readFileSync(resolve(MESSAGES_DIR, `${loc}.json`), 'utf-8'));
  }
  return data;
}

function flattenKeys(data) {
  const keys = new Set();
  for (const locData of Object.values(data)) {
    for (const [cat, val] of Object.entries(locData)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const k of Object.keys(val)) {
          keys.add(`${cat}.${k}`);
        }
      } else {
        keys.add(cat);
      }
    }
  }
  return [...keys].sort();
}

/** Minimal CSV escape: wrap in quotes if contains comma, quote, or newline */
function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Parse a CSV line into fields (handles quoted fields) */
function csvParseLine(line) {
  const fields = [];
  let curr = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { curr += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(curr); curr = '';
    } else {
      curr += ch;
    }
  }
  fields.push(curr);
  return fields;
}

// ── Commands ────────────────────────────────

function jsonToCsv() {
  const data = loadLocales();
  const allKeys = flattenKeys(data);

  const lines = [];
  lines.push(['key', ...LOCALES].map(csvEscape).join(','));

  for (const keyPath of allKeys) {
    const parts = keyPath.split('.');
    const cat = parts[0];
    const key = parts.length > 1 ? parts[1] : null;
    const row = [keyPath];

    for (const loc of LOCALES) {
      let val = '';
      if (key) {
        val = data[loc]?.[cat]?.[key] ?? '';
      } else {
        val = data[loc]?.[cat] ?? '';
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      row.push(csvEscape(val));
    }
    lines.push(row.join(','));
  }

  writeFileSync(CSV_PATH, lines.join('\n') + '\n');
  console.log(`✓ ${CSV_PATH}: ${allKeys.length} keys × ${LOCALES.length} locales`);
}

function csvToJson() {
  let csvText;
  try {
    csvText = readFileSync(CSV_PATH, 'utf-8');
  } catch {
    console.error(`✗ ${CSV_PATH} not found. Run json-to-csv first.`);
    process.exit(1);
  }

  const lines = csvText.trim().split('\n');
  const header = csvParseLine(lines[0]);
  const csvLocales = header.slice(1);

  // Map CSV column index → locale name
  /** @type {Map<number, string>} */
  const colMap = new Map();
  for (let i = 0; i < csvLocales.length; i++) {
    if (LOCALES.includes(csvLocales[i])) {
      colMap.set(i, csvLocales[i]);
    }
  }

  // Initialize data
  /** @type {Record<string, Record<string, unknown>>} */
  const data = {};
  for (const loc of LOCALES) data[loc] = {};

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const row = csvParseLine(lines[lineIdx]);
    if (!row[0]) continue;
    const keyPath = row[0].trim();
    const parts = keyPath.split('.');
    const cat = parts[0];
    const key = parts.length > 1 ? parts[1] : null;

    for (const [colIdx, loc] of colMap) {
      const raw = (row[colIdx + 1] ?? '').trim();
      if (!raw) continue;

      let val = raw;
      // Parse nested JSON objects (like level.hsk values)
      if (raw.startsWith('{')) {
        try { val = JSON.parse(raw); } catch { /* keep as string */ }
      }

      if (key) {
        data[loc][cat] ??= {};
        data[loc][cat][key] = val;
      } else {
        data[loc][cat] = val;
      }
    }
  }

  // Sort keys and write
  for (const loc of LOCALES) {
    // Sort top-level keys
    const sorted = {};
    for (const cat of Object.keys(data[loc]).sort()) {
      const val = data[loc][cat];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        // Sort sub-keys
        const subSorted = {};
        for (const k of Object.keys(val).sort()) {
          subSorted[k] = val[k];
        }
        sorted[cat] = subSorted;
      } else {
        sorted[cat] = val;
      }
    }
    data[loc] = sorted;

    writeFileSync(
      resolve(MESSAGES_DIR, `${loc}.json`),
      JSON.stringify(data[loc], null, 4) + '\n',
    );
  }

  console.log(`✓ ${CSV_PATH} → ${LOCALES.length} locale JSONs written`);
}

// ── CLI ─────────────────────────────────────

const cmd = process.argv[2];
if (cmd === 'json-to-csv') jsonToCsv();
else if (cmd === 'csv-to-json') csvToJson();
else {
  console.log('Usage: node scripts/sync-translations.mjs <json-to-csv|csv-to-json>');
  process.exit(1);
}
