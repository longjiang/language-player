import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import Link from 'next/link';
import { DocSidebar } from '../doc-sidebar';

interface Props {
  params: { l1: string; l2: string; slug: string[] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = getDoc(params.slug);
  if (!doc) return { title: 'Not Found' };
  const match = doc.content.match(/^# (.+)$/m);
  const title = match?.[1] ?? 'Documentation';
  return { title };
}

function getDoc(slug: string[]): { content: string } | null {
  const relativePath = slug.join('/');
  const possibleDirs = [
    resolve(process.cwd(), 'apps/web/content/docs'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    try {
      const filePath = resolve(docsDir, `${relativePath}.md`);
      return { content: readFileSync(filePath, 'utf-8') };
    } catch { /* try next */ }
  }
  return null;
}

interface DocMeta {
  slug: string;
  title: string;
  children?: DocMeta[];
}

/** Recursively read docs from a directory. Returns a sorted tree. */
function readDocsTree(dir: string, basePath: string = ''): DocMeta[] {
  const entries = readdirSync(dir);
  const items: DocMeta[] = [];
  const dirs: DocMeta[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const children = readDocsTree(fullPath, entry);
      if (children.length > 0) {
        dirs.push({ slug: entry, title: categoryLabel(entry), children });
      }
    } else if (entry.endsWith('.md')) {
      const content = readFileSync(fullPath, 'utf-8');
      const match = content.match(/^# (.+)$/m);
      const slug = basePath ? `${basePath}/${entry.replace(/\.md$/, '')}` : entry.replace(/\.md$/, '');
      const title: string = match?.[1] ?? entry.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      items.push({ slug, title });
    }
  }

  // Sort: root items first (alphabetical), then directories (alphabetical)
  items.sort((a, b) => a.title.localeCompare(b.title));
  dirs.sort((a, b) => a.title.localeCompare(b.title));

  return [...items, ...dirs];
}

function categoryLabel(slug: string): string {
  const labels: Record<string, string> = {
    media: 'Media',
    reading: 'Reading',
    vocab: 'Vocab',
    account: 'Account',
    navigation: 'Navigation',
  };
  return labels[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getAllDocs(): DocMeta[] {
  const possibleDirs = [
    resolve(process.cwd(), 'apps/web/content/docs'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    try {
      return readDocsTree(docsDir);
    } catch { /* try next */ }
  }
  return [];
}

interface DocEntry {
  slug: string;
  title: string;
  content: string;
}

function getSearchIndex(): DocEntry[] {
  const possibleDirs = [
    resolve(process.cwd(), 'apps/web/content/docs'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    const entries: DocEntry[] = [];
    try { walkDocs(docsDir, '', entries); } catch { continue; }
    return entries;
  }
  return [];
}

function walkDocs(dir: string, basePath: string, out: DocEntry[]) {
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
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

/** Slugify a heading for use as an anchor ID (matches rehype-slug behaviour). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface TocItem {
  level: number;
  text: string;
  id: string;
}

/** Extract H2/H3 headings from markdown for the sidebar TOC. */
function extractToc(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^(##|###)\s+(.+)$/);
    if (match) {
      const level = match[1]!.length;
      const text = match[2]!.trim();
      headings.push({ level, text, id: slugify(text) });
    }
  }
  return headings;
}

export default function DocPage({ params }: Props) {
  const { l1, l2, slug } = params;
  const doc = getDoc(slug);
  const docs = getAllDocs();
  const searchIndex = getSearchIndex();
  const currentSlug = slug.join('/');

  if (!doc) {
    notFound();
  }

  const toc = extractToc(doc.content);

  return (
    <div className="flex justify-center gap-8 px-4 py-12">
      {/* Main content */}
      <article className="prose prose-slate dark:prose-invert max-w-3xl min-w-0 flex-1
        prose-headings:scroll-mt-20
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm
        prose-pre:bg-muted
        prose-table:block prose-table:overflow-x-auto
        ">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            a: ({ href, children, ...props }) => {
              // Rewrite /docs/... links to include language prefix
              let resolved = href;
              if (resolved?.startsWith('/docs/')) {
                resolved = `/${l1}/${l2}${resolved}`;
              }
              // External & mailto use native <a>, internal use <Link>
              const external = resolved?.startsWith('http') || resolved?.startsWith('mailto:');
              if (external) {
                return <a href={resolved} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
              }
              return <Link href={resolved ?? '#'} {...props}>{children}</Link>;
            },
          }}
        >
          {doc.content}
        </ReactMarkdown>

        <hr className="my-8" />
        <Link
          href={`/${l1}/${l2}/docs`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Documentation
        </Link>
      </article>

      {/* Sidebar TOC */}
      <DocSidebar toc={toc} docs={docs} l1={l1} l2={l2} currentSlug={currentSlug} searchIndex={searchIndex} />
    </div>
  );
}
