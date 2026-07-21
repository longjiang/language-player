#!/usr/bin/env node
/**
 * Validates ICU MessageFormat syntax in translations.csv.
 *
 * Parses every non-empty translation string with @formatjs/icu-messageformat-parser
 * (the same parser used by react-intl and next-intl). Reports any strings that
 * fail to parse as valid ICU.
 *
 * Usage:
 *   node scripts/validate-icu.mjs translations.csv
 *   node scripts/validate-icu.mjs translations.csv --verbose
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from '@formatjs/icu-messageformat-parser';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname;

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

const args = process.argv.slice(2);
const csvPath = args[0] ? resolve(args[0]) : resolve(process.cwd(), 'translations.csv');
const verbose = args.includes('--verbose');
const stats = { total: 0, valid: 0, errors: [] };

let csvText;
try {
  csvText = readFileSync(csvPath, 'utf-8');
} catch {
  console.error(`✗ ${csvPath} not found.`);
  process.exit(1);
}

const lines = csvText.trim().replace(/\r/g, '').split('\n');
const header = csvParseLine(lines[0]);

for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
  const row = csvParseLine(lines[lineIdx]);
  if (!row[0]) continue;
  const key = row[0].trim();

  for (let col = 1; col < row.length && col < header.length; col++) {
    const value = row[col]?.trim();
    const locale = header[col];
    if (!value) continue;

    stats.total++;

    try {
      parse(value);
      stats.valid++;
      if (verbose) console.log(`  ✓ ${key} [${locale}]`);
    } catch (err) {
      stats.errors.push({ line: lineIdx + 1, key, locale, value: value.slice(0, 60), message: err.message });
      if (!verbose) console.error(`  ✗ line ${lineIdx + 1}, ${key} [${locale}]: ${err.message}`);
    }
  }
}

console.log(`\n${stats.valid}/${stats.total} strings valid`);
if (stats.errors.length > 0) {
  console.log(`${stats.errors.length} errors found`);
  process.exit(1);
} else {
  console.log('All strings are valid ICU MessageFormat ✓');
}
