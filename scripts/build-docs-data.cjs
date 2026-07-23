const fs = require('fs');
const path = require('path');
const docsDir = 'docs/content';

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      files.push(...walk(path.join(dir, e.name), base ? base + '/' + e.name : e.name));
    } else if (e.name.endsWith('.md')) {
      const relPath = base ? base + '/' + e.name.replace(/\.md$/, '') : e.name.replace(/\.md$/, '');
      const category = base.split('/')[0] || 'getting-started';
      const title = e.name.replace(/\.md$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      files.push({ relPath, fullPath: path.join(dir, e.name), category, title });
    }
  }
  return files;
}

const items = walk(docsDir);
const lines = [];
lines.push('// Auto-generated from apps/web/content/docs/ — DO NOT EDIT');
lines.push('export type DocEntry = { path: string; title: string; category: string; content: string };');
lines.push('');
lines.push('export const DOCS: DocEntry[] = [');

for (const item of items) {
  const raw = fs.readFileSync(item.fullPath, 'utf-8');
  const content = raw.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  lines.push(`  { path: '${item.relPath}', title: '${item.title}', category: '${item.category}', content: \`${content}\` },`);
}

lines.push('];');
lines.push('');
lines.push('export const DOC_CATEGORIES: { key: string; title: string }[] = [');
const seen = new Set();
for (const item of items) {
  if (seen.has(item.category)) continue;
  seen.add(item.category);
  const title = item.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  lines.push(`  { key: '${item.category}', title: '${title}' },`);
}
lines.push('];');

fs.writeFileSync('packages/shared/src/docs.ts', lines.join('\n'));
console.log('Written', items.length, 'docs to packages/shared/src/docs.ts');
