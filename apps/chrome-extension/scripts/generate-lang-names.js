/**
 * Generator: translations.csv lang.* → dist/lang-names.json
 *
 * Extracts all language name translations from the monorepo's translations.csv
 * and builds a JSON lookup used by the Chrome extension's languageName().
 *
 * Output format: { langCode: { locale: translatedName } }
 * Locale keys use Chrome's getUILanguage() format (underscores, e.g. zh_CN).
 *
 * Usage: node scripts/generate-lang-names.js
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.resolve(__dirname, '../../../translations.csv');
const OUT_PATH = path.resolve(__dirname, '../dist/lang-names.json');

// CSV columns → Chrome locale code (getUILanguage() format)
// CSV uses hyphens (zh-Hans), Chrome uses underscores (zh_CN)
const COLUMN_TO_CHROME = {
  'en': 'en',
  'zh-Hans': 'zh_CN',
  'zh-Hant': 'zh_TW',
  'af': 'af',
  'ar': 'ar',
  'ca': 'ca',
  'de': 'de',
  'el': 'el',
  'es': 'es',
  'fi': 'fi',
  'fr': 'fr',
  'ga': 'ga',
  'hi': 'hi',
  'hr': 'hr',
  'hu': 'hu',
  'id': 'id',
  'it': 'it',
  'ja': 'ja',
  'ko': 'ko',
  'nl': 'nl',
  'no': 'no',
  'pl': 'pl',
  'pt': 'pt',
  'ro': 'ro',
  'ru': 'ru',
  'sr': 'sr',
  'sv': 'sv',
  'sw': 'sw',
  'th': 'th',
  'tr': 'tr',
  'vi': 'vi',
};

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function main() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = csvText.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    console.error('CSV is empty');
    process.exit(1);
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  // Map: CSV column index → chrome locale code
  const colMap = [];
  for (let i = 0; i < header.length; i++) {
    const chromeLocale = COLUMN_TO_CHROME[header[i]] || null;
    colMap.push(chromeLocale);
  }

  const result = {};

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const key = cells[0];

    // Only process lang.* keys
    if (!key.startsWith('lang.')) continue;

    const langCode = key.slice('lang.'.length);
    if (!langCode) continue;

    const entry = {};
    for (let j = 1; j < cells.length && j < colMap.length; j++) {
      const chromeLocale = colMap[j];
      if (!chromeLocale) continue;
      const value = cells[j].trim();
      if (value) {
        entry[chromeLocale] = value;
      }
    }

    // Only include if it has at least the English name
    if (entry.en) {
      result[langCode] = entry;
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result), 'utf-8');
  console.log(`[lang-names] Generated ${OUT_PATH} with ${Object.keys(result).length} languages`);
}

main();
