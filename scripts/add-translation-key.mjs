#!/usr/bin/env node
/**
 * Safely add or update a single translation row in translations.csv.
 *
 * Usage:
 *   node scripts/add-key.mjs <payload.json>
 *
 *   node scripts/add-key.mjs --stdin   (reads JSON from stdin)
 *
 * Payload format (JSON):
 *   {
 *     "key": "msg.my_key",
 *     "en": "English text",
 *     "zh-Hans": "...",
 *     "zh-Hant": "...",
 *     "af": "...",
 *     ...all 31 locale codes...
 *   }
 *
 * Rules:
 *   - ALL locale columns present in the CSV header MUST be in the payload
 *     (all-or-nothing — no partial rows that would leave empty cells).
 *   - Uses csvParseLine/csvEscape to avoid comma/quote corruption.
 *   - If the key already exists, the row is updated in-place.
 *   - If the key is new, it's inserted in alphabetical order among same-category keys.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CSV_PATH = resolve(__dirname, '..', 'translations.csv');

// ── CSV helpers (inline to keep script self-contained) ──

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

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Main ─────────────────────────────────────

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

// Parse arguments
let payload;
const arg = process.argv[2];

if (!arg) {
  fail('Usage: node scripts/add-key.mjs <payload.json> | --stdin');
}

if (arg === '--stdin') {
  // Read from stdin
  const chunks = [];
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', d => chunks.push(d));
  process.stdin.on('end', () => {
    try {
      payload = JSON.parse(chunks.join(''));
      processPayload(payload);
    } catch (e) {
      fail('Invalid JSON from stdin: ' + e.message);
    }
  });
  process.stdin.on('error', e => fail('Failed to read stdin: ' + e.message));
} else {
  // Read from file
  const filePath = resolve(arg);
  if (!existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }
  try {
    payload = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    fail(`Invalid JSON in ${filePath}: ${e.message}`);
  }
  processPayload(payload);
}

function processPayload(payload) {
  // 1. Validate payload
  if (!payload.key || typeof payload.key !== 'string') {
    fail('Payload must have a "key" field (string).');
  }

  // 2. Read CSV
  const csvText = readFileSync(CSV_PATH, 'utf-8');
  const lines = csvText.trim().split('\n');
  const header = csvParseLine(lines[0]);

  // Header should be: key, en, zh-Hans, zh-Hant, af, ar, ...
  const localeCols = header.slice(1); // all columns except 'key'
  const expectedLocales = new Set(localeCols);

  // 3. Check all-or-nothing
  const providedLocales = new Set(
    Object.keys(payload).filter(k => k !== 'key')
  );

  const missing = [];
  for (const loc of expectedLocales) {
    if (!providedLocales.has(loc)) missing.push(loc);
  }
  if (missing.length > 0) {
    const extra = [...providedLocales].filter(l => !expectedLocales.has(l));
    let msg = `Missing locales (${missing.length}): ${missing.join(', ')}`;
    if (extra.length > 0) msg += `\nUnknown locales (${extra.length}): ${extra.join(', ')}`;
    fail(msg);
  }

  // 4. Parse all rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(csvParseLine(lines[i]));
  }

  // 5. Check if key already exists
  const existingIdx = rows.findIndex(r => r[0] === payload.key);
  let updated = false;

  // Build the new row: [key, ...locale values in header order]
  const newRow = [payload.key];
  for (const loc of localeCols) {
    newRow.push(payload[loc] ?? '');
  }

  if (existingIdx >= 0) {
    const oldEn = rows[existingIdx][header.indexOf('en')] || '(empty)';
    rows[existingIdx] = newRow;
    updated = true;
    console.log(`✓ Updated existing key "${payload.key}" (was: "${oldEn.substring(0, 50)}")`);
  } else {
    // Insert in alphabetical order within same category
    const category = payload.key.split('.')[0];
    let insertIdx = rows.length; // default: append
    for (let i = 0; i < rows.length; i++) {
      const rowCat = rows[i][0]?.split('.')[0];
      if (rowCat > category) {
        insertIdx = i;
        break;
      }
      if (rowCat === category && rows[i][0] > payload.key) {
        insertIdx = i;
        break;
      }
    }
    rows.splice(insertIdx, 0, newRow);
    console.log(`✓ Added new key "${payload.key}" at row ${insertIdx + 2} (category: ${category})`);
  }

  // 6. Write CSV
  const output = [
    header.map(csvEscape).join(','),
    ...rows.map(r => r.map(csvEscape).join(',')),
  ].join('\n') + '\n';

  writeFileSync(CSV_PATH, output);

  const verb = updated ? 'Updated' : 'Added';
  console.log(`✓ ${verb} in ${CSV_PATH}`);
  console.log(`  Run: node scripts/sync-translations.mjs csv-to-json`);
}
