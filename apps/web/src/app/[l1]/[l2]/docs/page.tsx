import { Metadata } from 'next';
import Link from 'next/link';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BookOpen, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Guides, reference, and FAQs for Language Player.',
};

interface DocMeta {
  slug: string;
  title: string;
}

/** Read all .md files from content/docs/ and extract the first # heading as title. */
function getDocs(): DocMeta[] {
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

interface Props {
  params: { l1: string; l2: string };
}

export default function DocsPage({ params }: Props) {
  const { l1, l2 } = params;
  const docs = getDocs();

  return (
    <div className="flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Documentation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Guides, reference, and frequently asked questions
          </p>
        </div>

        {docs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No documentation available yet.</p>
        ) : (
          <div className="space-y-1">
            {docs.map(doc => (
              <Link
                key={doc.slug}
                href={`/${l1}/${l2}/docs/${doc.slug}`}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{doc.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
