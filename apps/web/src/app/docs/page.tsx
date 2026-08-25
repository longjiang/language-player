import { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { FileText } from 'lucide-react';
import { resolveDocsL1 } from '@/lib/docs-locale';
import { loadTranslationMap, resolveTitlePlaceholders } from '@/lib/docs-titles';
import { DocSearch } from './doc-search';
import { CategoryTitle } from './category-title';
import { DocPageHeading } from './doc-page-heading';
import { DocEmptyState } from './doc-empty-state';
import { AskAiButton } from '@/components/docs/ask-ai-dialog';

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

function readDocsTree(
  dir: string,
  basePath: string = '',
  titleMap?: Map<string, string>,
  trans?: Map<string, string>,
): DocMeta[] {
  const entries = readdirSync(dir);
  const items: DocMeta[] = [];
  const dirs: DocMeta[] = [];

  const resolveTitle = (title: string) => (trans ? resolveTitlePlaceholders(title, trans) : title);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const children = readDocsTree(fullPath, entry, titleMap, trans);
      if (children.length > 0) {
        const localized = trans?.get(`title.${entry}`);
        dirs.push({ slug: entry, title: resolveTitle(localized ?? categoryLabel(entry)), children });
      }
    } else if (entry.endsWith('.md')) {
      const slug = basePath ? `${basePath}/${entry.replace(/\.md$/, '')}` : entry.replace(/\.md$/, '');
      const resolvedTitle = titleMap?.get(slug);
      if (resolvedTitle) {
        items.push({ slug, title: resolveTitle(resolvedTitle) });
      } else {
        const content = readFileSync(fullPath, 'utf-8');
        const match = content.match(/^# (.+)$/m);
        const title: string = match?.[1] ?? entry.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        items.push({ slug, title: resolveTitle(title) });
      }
    }
  }

  items.sort((a, b) => a.title.localeCompare(b.title));
  dirs.sort((a, b) => a.title.localeCompare(b.title));
  return [...items, ...dirs];
}

function getDocs(l1: string): DocMeta[] {
  const titleMap = loadTitleMap(l1);
  const trans = loadTranslationMap(l1);
  const possibleDirs = [
    resolve(process.cwd(), '../../packages/docs/content'),
    resolve(process.cwd(), '../../packages/docs/content'),
  ];
  for (const docsDir of possibleDirs) {
    try { return readDocsTree(docsDir, '', titleMap, trans); } catch { /* try next */ }
  }
  return [];
}

/** Load slug→resolved-title map from the locale JSON if available. */
function loadTitleMap(l1: string): Map<string, string> | undefined {
  const dataDirs = [
    resolve(process.cwd(), '../../packages/docs/i18n'),
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

function DocList({ docs, l1, categoryTitles }: {
  docs: DocMeta[];
  l1: string;
  categoryTitles?: Record<string, string>;
}) {
  return (
    <ul className="space-y-1">
      {docs.map(doc => {
        if (doc.children && doc.children.length > 0) {
          return (
            <li key={doc.slug}>
              <div className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <CategoryTitle slug={doc.slug} override={categoryTitles?.[doc.slug]} />
              </div>
              <div className="ml-7 border-l border-border/50 pl-4">
                <DocList docs={doc.children} l1={l1} categoryTitles={categoryTitles} />
              </div>
            </li>
          );
        }
        return (
          <li key={doc.slug}>
            <Link
              href={`/docs/${doc.slug}?l1=${encodeURIComponent(l1)}`}
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
  const trans = loadTranslationMap(l1);
  const resolveTitle = (title: string) => resolveTitlePlaceholders(title, trans);
  // Prefer translated locale JSON if available
  const localeEntries = loadLocaleEntries(l1);
  if (localeEntries) {
    return localeEntries.map((e) => ({ ...e, title: resolveTitle(e.title) }));
  }
  // Fall back to raw .md files (English)
  const possibleDirs = [
    resolve(process.cwd(), '../../packages/docs/content'),
    resolve(process.cwd(), '../../packages/docs/content'),
  ];
  for (const docsDir of possibleDirs) {
    const entries: DocEntry[] = [];
    try { walkDocs(docsDir, '', entries, resolveTitle); } catch { continue; }
    return entries;
  }
  return [];
}

/** Load translated entries from docs-i18n/{l1}.json if available. */
function loadLocaleEntries(l1: string): DocEntry[] | null {
  const dataDirs = [
    resolve(process.cwd(), '../../packages/docs/i18n'),
    resolve(process.cwd(), '../../packages/docs/i18n'),
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

function walkDocs(
  dir: string,
  basePath: string,
  out: DocEntry[],
  resolveTitle: (title: string) => string = (t) => t,
) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDocs(fullPath, basePath ? `${basePath}/${item}` : item, out, resolveTitle);
    } else if (item.endsWith('.md')) {
      const content = readFileSync(fullPath, 'utf-8');
      const match = content.match(/^# (.+)$/m);
      const slug = basePath ? `${basePath}/${item.replace(/\.md$/, '')}` : item.replace(/\.md$/, '');
      const title: string = match?.[1] ?? item.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      out.push({ slug, title: resolveTitle(title), content });
    }
  }
}

interface Props {
  searchParams: Promise<{ l1?: string }>;
}

export default async function DocsPage(props: Props) {
  const searchParams = await props.searchParams;
  const headerList = await headers();
  const l1 = resolveDocsL1(searchParams.l1, headerList.get('accept-language'));
  const docs = getDocs(l1);
  const searchIndex = getSearchIndex(l1);
  // Category labels resolved for the ?l1= query (slug → translated title).
  const trans = loadTranslationMap(l1);
  const categoryTitles: Record<string, string> = {};
  for (const slug of ['media', 'reading', 'vocab', 'account', 'general']) {
    categoryTitles[slug] = trans.get(`title.${slug}`) ?? categoryLabel(slug);
  }

  return (
    <div className="flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <DocPageHeading />
          <AskAiButton className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90" />
        </div>

        {/* Search + Doc list */}
        {docs.length === 0 ? (
          <DocEmptyState />
        ) : (
          <DocSearch docs={searchIndex} l1={l1}>
            <DocList docs={docs} l1={l1} categoryTitles={categoryTitles} />
          </DocSearch>
        )}
      </div>
    </div>
  );
}
