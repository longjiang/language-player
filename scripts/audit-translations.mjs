#!/usr/bin/env node
/**
 * Audit all locale JSONs for translation quality issues:
 * 1. Strings identical to English (untranslated)
 * 2. Bracket mismatch (broken ICU/interpolation)
 * 3. Wrong script (e.g., Latin-only where Cyrillic/Arabic/Thai expected)
 */
import { readFileSync, readdirSync } from 'fs';

const dir = 'apps/web/messages/';
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const en = JSON.parse(readFileSync(dir + 'en.json', 'utf8'));

const scriptRanges = {
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/,
  cjk: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/,
  cyrillic: /[\u0400-\u04FF\u0500-\u052F]/,
  thai: /[\u0E00-\u0E7F]/,
  greek: /[\u0370-\u03FF]/,
  devanagari: /[\u0900-\u097F]/,
};
const locScript = {
  ar: 'arabic', ja: 'cjk', zh: 'cjk', ko: 'cjk',
  ru: 'cyrillic', sr: 'cyrillic',
  th: 'thai', el: 'greek', hi: 'devanagari',
};

const issues = [];
let total = 0;

for (const f of files) {
  const loc = f.replace('.json', '');
  if (loc === 'en') continue;
  const m = JSON.parse(readFileSync(dir + f, 'utf8'));

  for (const cat of Object.keys(m)) {
    for (const k of Object.keys(m[cat])) {
      total++;
      const val = m[cat][k];
      const enVal = en[cat]?.[k] || '';
      if (!val || typeof val !== 'string') continue;

      // 1. Untranslated (identical to English, multi-word)
      if (val === enVal && enVal.length > 4 && enVal.includes(' ')) {
        issues.push(`${loc} ▶ ${cat}.${k} | UNTRANSLATED | ${val.substring(0, 60)}`);
      }

      // 2. Bracket mismatch (broken interpolation)
      const enB = (enVal.match(/\{/g) || []).length;
      const valB = (val.match(/\{/g) || []).length;
      if (enB !== valB && enB > 0 && !val.includes(', plural, ')) {
        issues.push(`${loc} ▶ ${cat}.${k} | BRACKETS en:${enB}→${valB} | en="${enVal.substring(0, 35)}" → "${val.substring(0, 35)}"`);
      }

      // 3. Wrong script
      const exp = locScript[loc.substring(0, 2)] || locScript[loc];
      if (exp && enVal !== val && enVal.length > 10 && !val.includes(', plural, ')) {
        const rx = scriptRanges[exp];
        if (rx && !rx.test(val) && enVal.includes(' ') && val.includes(' ')) {
          issues.push(`${loc} ▶ ${cat}.${k} | NO-${exp.toUpperCase()} | "${val.substring(0, 50)}"`);
        }
      }
    }
  }
}

console.log(`Total non-en translations checked: ${total}`);
console.log(`Issues found: ${issues.length}\n`);

if (issues.length === 0) {
  console.log('✅ All translations pass!');
} else {
  // Group by type
  const groups = {};
  for (const i of issues) {
    const type = i.includes('UNTRANSLATED') ? 'Untranslated' :
                 i.includes('BRACKETS') ? 'Bracket mismatch' :
                 i.includes('NO-') ? 'Wrong script' : 'Other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(i);
  }
  for (const [type, items] of Object.entries(groups)) {
    console.log(`\n=== ${type} (${items.length}) ===`);
    for (const item of items) console.log(`  ⚠️  ${item}`);
  }
}
