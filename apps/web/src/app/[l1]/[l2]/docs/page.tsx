import { Metadata } from 'next';
import Link from 'next/link';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { FileText } from 'lucide-react';
import { DocSearch } from './doc-search';
import { CategoryTitle } from './category-title';
import { DocPageHeading } from './doc-page-heading';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Guides, reference, and FAQs for Language Player.',
};

interface DocMeta {
  slug: string;
  title: string;
  children?: DocMeta[];
}

function categoryLabel(slug: string): string {
  const labels: Record<string, string> = {
    media: 'Media',
    reading: 'Reading',
    vocab: 'Vocab',
    account: 'Account',
    general: 'General',
  };
  return labels[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function readDocsTree(dir: string, basePath: string = '', titleMap?: Map<string, string>): DocMeta[] {
  const entries = readdirSync(dir);
  const items: DocMeta[] = [];
  const dirs: DocMeta[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const children = readDocsTree(fullPath, entry, titleMap);
      if (children.length > 0) {
        dirs.push({ slug: entry, title: categoryLabel(entry), children });
      }
    } else if (entry.endsWith('.md')) {
      const slug = basePath ? `${basePath}/${entry.replace(/\.md$/, '')}` : entry.replace(/\.md$/, '');
      const resolvedTitle = titleMap?.get(slug);
      if (resolvedTitle) {
        items.push({ slug, title: resolvedTitle });
      } else {
        const content = readFileSync(fullPath, 'utf-8');
        const match = content.match(/^# (.+)$/m);
        const title: string = match?.[1] ?? entry.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        items.push({ slug, title });
      }
    }
  }

  items.sort((a, b) => a.title.localeCompare(b.title));
  dirs.sort((a, b) => a.title.localeCompare(b.title));
  return [...items, ...dirs];
}

function getDocs(l1: string): DocMeta[] {
  const titleMap = loadTitleMap(l1);
  const possibleDirs = [
    resolve(process.cwd(), 'docs/content'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    try { return readDocsTree(docsDir, '', titleMap); } catch { /* try next */ }
  }
  return [];
}

/** Load slug→resolved-title map from the locale JSON if available. */
function loadTitleMap(l1: string): Map<string, string> | undefined {
  const dataDirs = [
    resolve(process.cwd(), 'apps/web/src/data/docs-i18n'),
    resolve(process.cwd(), 'src/data/docs-i18n'),
  ];
  for (const dataDir of dataDirs) {
    try {
      const entries = JSON.parse(readFileSync(resolve(dataDir, `${l1}.json`), 'utf-8'));
      const map = new Map<string, string>();
      for (const e of entries) {
        map.set(e.slug, e.title);
      }
      return map;
    } catch { /* try next */ }
  }
  return undefined;
}

function DocList({ docs, l1, l2 }: { docs: DocMeta[]; l1: string; l2: string }) {
  return (
    <ul className="space-y-1">
      {docs.map(doc => {
        if (doc.children && doc.children.length > 0) {
          return (
            <li key={doc.slug}>
              <div className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <CategoryTitle slug={doc.slug} />
              </div>
              <div className="ml-7 border-l border-border/50 pl-4">
                <DocList docs={doc.children} l1={l1} l2={l2} />
              </div>
            </li>
          );
        }
        return (
          <li key={doc.slug}>
            <Link
              href={`/${l1}/${l2}/docs/${doc.slug}`}
              className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-colors hover:bg-muted"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{doc.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface DocEntry {
  slug: string;
  title: string;
  content: string;
}

/** Build a flat search index with full doc content for fuzzy search. */
function getSearchIndex(l1: string): DocEntry[] {
  // Prefer translated locale JSON if available
  const localeEntries = loadLocaleEntries(l1);
  if (localeEntries) return localeEntries;
  // Fall back to raw .md files (English)
  const possibleDirs = [
    resolve(process.cwd(), 'docs/content'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    const entries: DocEntry[] = [];
    try { walkDocs(docsDir, '', entries); } catch { continue; }
    return entries;
  }
  return [];
}

/** Load translated entries from docs-i18n/{l1}.json if available. */
function loadLocaleEntries(l1: string): DocEntry[] | null {
  const dataDirs = [
    resolve(process.cwd(), 'src/data/docs-i18n'),
    resolve(process.cwd(), 'apps/web/src/data/docs-i18n'),
    resolve(process.cwd(), '..', 'apps/web/src/data/docs-i18n'),
  ];
  for (const dataDir of dataDirs) {
    try {
      const entries = JSON.parse(readFileSync(resolve(dataDir, `${l1}.json`), 'utf-8'));
      return entries.map((e: { slug: string; title: string; content: string }) => ({
        slug: e.slug,
        title: e.title,
        content: e.content,
      }));
    } catch { /* try next */ }
  }
  return null;
}

function walkDocs(dir: string, basePath: string, out: DocEntry[]) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDocs(fullPath, basePath ? `${basePath}/${item}` : item, out);
    } else if (item.endsWith('.md')) {
      const content = readFileSync(fullPath, 'utf-8');
      const match = content.match(/^# (.+)$/m);
      const slug = basePath ? `${basePath}/${item.replace(/\.md$/, '')}` : item.replace(/\.md$/, '');
      const title: string = match?.[1] ?? item.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      out.push({ slug, title, content });
    }
  }
}

interface Props {
  params: { l1: string; l2: string };
}

export default function DocsPage({ params }: Props) {
  const { l1, l2 } = params;
  const docs = getDocs(l1);
  const searchIndex = getSearchIndex(l1);

  return (
    <div className="flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <DocPageHeading />

        {/* Search + Doc list */}
        {docs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No documentation available yet.</p>
        ) : (
          <DocSearch docs={searchIndex} l1={l1} l2={l2}>
            <DocList docs={docs} l1={l1} l2={l2} />
          </DocSearch>
        )}
      </div>
    </div>
  );
}
