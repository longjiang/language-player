import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import Link from 'next/link';
import { DocSidebar } from '../doc-sidebar';

interface Props {
  params: { l1: string; l2: string; slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = getDoc(params.slug);
  if (!doc) return { title: 'Not Found' };
  const match = doc.content.match(/^# (.+)$/m);
  const title = match?.[1] ?? 'Documentation';
  return { title };
}

function getDoc(slug: string): { content: string } | null {
  const possibleDirs = [
    resolve(process.cwd(), 'apps/web/content/docs'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    try {
      const filePath = resolve(docsDir, `${slug}.md`);
      return { content: readFileSync(filePath, 'utf-8') };
    } catch { /* try next */ }
  }
  return null;
}

interface DocMeta {
  slug: string;
  title: string;
}

/** Read all .md files and extract titles. */
function getAllDocs(): DocMeta[] {
  const possibleDirs = [
    resolve(process.cwd(), 'apps/web/content/docs'),
    resolve(process.cwd(), 'content/docs'),
  ];
  for (const docsDir of possibleDirs) {
    try {
      const files = readdirSync(docsDir).filter(f => f.endsWith('.md'));
      return files
        .map(f => {
          const slug = f.replace(/\.md$/, '');
          const content = readFileSync(resolve(docsDir, f), 'utf-8');
          const match = content.match(/^# (.+)$/m);
          const title: string = match?.[1] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return { slug, title };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
    } catch { /* try next */ }
  }
  return [];
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
      <DocSidebar toc={toc} docs={docs} l1={l1} l2={l2} currentSlug={slug} />
    </div>
  );
}
