const fs = require('fs');
const path = require('path');
const docsDir = 'packages/docs/content';

// ── Parse translations.csv → { key: en_value } ──
const csvRaw = fs.readFileSync('translations.csv', 'utf-8');
const csvLines = csvRaw.trim().split('\n');
const headers = csvLines[0].split(',');
const enIdx = headers.indexOf('en');
const keys = {};
for (let i = 1; i < csvLines.length; i++) {
  const cols = [];
  let col = '', inQuote = false;
  for (let j = 0; j < csvLines[i].length; j++) {
    const ch = csvLines[i][j];
    if (ch === '"' && !inQuote) inQuote = true;
    else if (ch === '"' && inQuote && csvLines[i][j+1] === '"') { col += '"'; j++; }
    else if (ch === '"' && inQuote) inQuote = false;
    else if (ch === ',' && !inQuote) { cols.push(col); col = ''; }
    else col += ch;
  }
  cols.push(col);
  if (cols[0] && cols[enIdx]) keys[cols[0]] = cols[enIdx];
}

function resolveKeys(text) {
  return text.replace(/\{\$([a-z0-9_.]+)\}/gi, (_, key) => keys[key] || `{\$${key}}`);
}

// ── Walk docs ──
function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      files.push(...walk(path.join(dir, e.name), base ? base + '/' + e.name : e.name));
    } else if (e.name.endsWith('.md')) {
      const relPath = base ? base + '/' + e.name.replace(/\.md$/, '') : e.name.replace(/\.md$/, '');
      const cat = base.split('/')[0] || '';
      // Parse title from H1 line (supports both {$key} and plain text)
      const raw = fs.readFileSync(path.join(dir, e.name), 'utf-8');
      const h1Match = raw.match(/^# (.+)$/m);
      let title = '';
      if (h1Match) {
        const h1 = h1Match[1].trim();
        // If H1 is a {$key} reference, resolve it from CSV (English)
        title = h1.replace(/\{\$([a-z0-9_.]+)\}/gi, (_, key) => keys[key] || `{$key}`);
        // If still contains {$key}, fallback to filename
        if (/\{\$/.test(title)) title = '';
      }
      if (!title) title = e.name.replace(/\.md$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      files.push({ relPath, fullPath: path.join(dir, e.name), cat, title });
    }
  }
  return files;
}

const items = walk(docsDir);
const lines = ['export type DocEntry = { path: string; title: string; category: string; content: string };', '', 'export const DOCS: DocEntry[] = ['];

for (const item of items) {
  const raw = fs.readFileSync(item.fullPath, 'utf-8');
  const resolved = resolveKeys(raw);
  const content = resolved.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  lines.push(`  { path: '${item.relPath}', title: '${item.title}', category: '${item.cat}', content: \`${content}\` },`);
}

lines.push('];');
lines.push('');
lines.push('export const DOC_CATEGORIES: { key: string; title: string }[] = [');
const seen = new Set();
for (const item of items) {
  if (!item.cat || seen.has(item.cat)) continue;
  const catTitle = keys[`title.${item.cat}`] || item.cat.charAt(0).toUpperCase() + item.cat.slice(1);
  seen.add(item.cat);
  lines.push(`  { key: '${item.cat}', title: '${catTitle}' },`);
}
lines.push('];');

// ── Embed locale translations ──
const i18nDir = 'packages/docs/i18n';
const locales = fs.readdirSync(i18nDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
lines.push('');
lines.push('export const DOCS_BY_LOCALE: Record<string, DocEntry[]> = {');
for (const loc of locales) {
  const data = JSON.parse(fs.readFileSync(path.join(i18nDir, loc + '.json'), 'utf-8'));
  const entries = data.map((d) => {
    const content = d.content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `    { path: '${d.slug}', title: '${d.title.replace(/'/g, "\\'")}', category: '${d.slug.split('/')[0] || ''}', content: \`${content}\` }`;
  });
  lines.push(`  '${loc}': [\n${entries.join(',\n')}\n  ],`);
}
lines.push('};');

fs.writeFileSync('packages/shared/src/docs.ts', lines.join('\n'));
console.log('Written', items.length, 'English +', locales.length, 'locales to packages/shared/src/docs.ts');
