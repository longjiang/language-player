import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug;
  if (!slug) return { title: 'Not Found' };
  const doc = getDoc(slug);
  if (!doc) return { title: 'Not Found' };
  const title = extractTitle(doc.content);
  return { title: `${title} — Docs — Language Player` };
}

function extractTitle(content: string): string {
  const match = content.match(/^# (.+)$/m);
  return match?.[1] ?? 'Documentation';
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

export default function DocPage({ params }: Props) {
  const slug = params.slug;
  if (!slug) notFound();
  const doc = getDoc(slug);

  if (!doc) {
    notFound();
  }

  return (
    <div className="min-h-screen px-4 py-12">
      <article className="prose prose-slate dark:prose-invert mx-auto max-w-3xl
        prose-headings:scroll-mt-20
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm
        prose-pre:bg-muted
        prose-table:block prose-table:overflow-x-auto
        ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {doc.content}
        </ReactMarkdown>

        <hr className="my-8" />
        <Link
          href="/docs"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Documentation
        </Link>
      </article>
    </div>
  );
}
