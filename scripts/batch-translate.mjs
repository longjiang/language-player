#!/usr/bin/env node
/**
 * Batch-translate empty CSV cells using the Python /translate_array endpoint.
 *
 * Reads translations.csv, finds empty cells per locale, batches English values
 * in groups of 15, calls the LLM translation API, and fills results back.
 *
 * Usage:
 *   node scripts/batch-translate.mjs              # translate all empty cells
 *   node scripts/batch-translate.mjs --dry-run    # show what would be translated
 *   node scripts/batch-translate.mjs --locale=fr  # translate only French
 *
 * Requires: Python backend running at API_URL (default: http://127.0.0.1:5001)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(ROOT, 'translations.csv');
const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const BATCH_SIZE = 15;
const DELAY_MS = 2000; // between batches

// ── Helpers ─────────────────────────────────

/** Parse a CSV line into fields (handles quoted values) */
function parseCSVLine(line) {
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── API call ────────────────────────────────

async function translateBatch(texts, l2) {
  // Map locale code to ISO 639-1 (the API expects simple codes)
  const l2Code = l2.split('-')[0]; // zh-Hant → zh, etc.

  const res = await fetch(`${API_URL}/translate_array`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, l1: l2Code, l2: 'en' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.translated_texts;
}

// ── CSV operations ──────────────────────────

function readCSV() {
  const text = readFileSync(CSV_PATH, 'utf-8');
  const lines = text.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { header, rows };
}

function writeCSV(header, rows) {
  const lines = [
    header.map(csvEscape).join(','),
    ...rows.map(r => r.map(csvEscape).join(',')),
  ];
  writeFileSync(CSV_PATH, lines.join('\n') + '\n');
}

// ── Main ────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const localeFilter = args.find(a => a.startsWith('--locale='))?.split('=')[1];

  const { header, rows } = readCSV();
  const enIdx = header.indexOf('en');
  if (enIdx === -1) { console.error('en column not found'); process.exit(1); }

  // Build work list: { locale, colIdx, batches of { key, en, rowIdx } }
  const work = [];

  for (let col = 1; col < header.length; col++) {
    const loc = header[col];
    if (localeFilter && loc !== localeFilter) continue;
    if (loc === 'en') continue;

    // Don't translate zh-* (they already have Simplified/Traditional)
    if (loc === 'zh-Hans' || loc === 'zh-Hant') continue;

    const tasks = [];
    for (let i = 0; i < rows.length; i++) {
      const val = rows[i][col]?.replace(/"/g, '')?.trim();
      const enVal = rows[i][enIdx]?.replace(/"/g, '')?.trim();
      if (!val && enVal) {
        tasks.push({ key: rows[i][0], en: enVal, rowIdx: i });
      }
    }

    if (tasks.length === 0) continue;

    // Split into batches
    const batches = [];
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      batches.push(tasks.slice(i, i + BATCH_SIZE));
    }

    work.push({ locale: loc, colIdx: col, batches, total: tasks.length });
  }

  if (work.length === 0) {
    console.log('No empty cells to translate.');
    return;
  }

  // Summary
  const totalCells = work.reduce((s, w) => s + w.total, 0);
  const totalBatches = work.reduce((s, w) => s + w.batches.length, 0);
  console.log(`Locales to translate: ${work.length}`);
  console.log(`Empty cells: ${totalCells}`);
  console.log(`Batches (${BATCH_SIZE}/batch): ${totalBatches}`);
  console.log(`Estimated time: ~${Math.ceil(totalBatches * DELAY_MS / 1000 / 60)} min`);
  console.log('');

  if (dryRun) {
    for (const w of work) {
      console.log(`  ${w.locale}: ${w.total} cells in ${w.batches.length} batches`);
    }
    console.log('\nDry run — no changes made.');
    return;
  }

  // Process each locale
  for (const w of work) {
    console.log(`\n${w.locale}: ${w.total} cells, ${w.batches.length} batches...`);

    for (let b = 0; b < w.batches.length; b++) {
      const batch = w.batches[b];
      const texts = batch.map(t => t.en);

      try {
        process.stdout.write(`  Batch ${b + 1}/${w.batches.length} (${texts.length} texts)... `);
        const translated = await translateBatch(texts, w.locale);

        if (!translated || translated.length !== texts.length) {
          console.log(`⚠️  Mismatch: got ${translated?.length}, expected ${texts.length}`);
          continue;
        }

        // Fill results back into rows
        for (let t = 0; t < batch.length; t++) {
          rows[batch[t].rowIdx][w.colIdx] = translated[t];
        }

        console.log('✓');
      } catch (e) {
        console.log(`✗ ${e.message}`);
        // Continue with next batch despite errors
      }

      // Save progress after each batch
      writeCSV(header, rows);

      if (b < w.batches.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    console.log(`  ✓ ${w.locale} done`);
  }

  // Final save
  writeCSV(header, rows);
  console.log('\n✓ All translations complete. CSV saved.');
  console.log('Run: node scripts/sync-translations.mjs csv-to-json');
}

main().catch(e => { console.error(e); process.exit(1); });
