'use client';

import { useState, useMemo, type ReactNode } from 'react';
import Fuse from 'fuse.js';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { stripMarkdown } from '@/lib/strip-markdown';

interface DocEntry {
  slug: string;
  title: string;
  content: string;
}

interface Props {
  docs: DocEntry[];
  l1: string;
  l2: string;
  /** The regular doc tree to show when not searching. */
  children: ReactNode;
}

/** Return a snippet of text around the first match, ~80 chars. */
function snippet(content: string, query: string): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 80) + '…';
  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + query.length + 50);
  const snip = content.slice(start, end);
  return (start > 0 ? '…' : '') + snip + (end < content.length ? '…' : '');
}

export function DocSearch({ docs, l1, l2, children }: Props) {
  const [query, setQuery] = useState('');

  const fuse = useMemo(
    () =>
      new Fuse(docs, {
        keys: ['title', 'content'],
        threshold: 0.4,
        includeScore: true,
      }),
    [docs],
  );

  const results = query.trim()
    ? fuse.search(query).slice(0, 8)
    : [];

  return (
    <div>
      {/* Search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search documentation…"
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map(({ item }) => (
            <li key={item.slug}>
              <Link
                href={`/${l1}/${l2}/docs/${item.slug}`}
                className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted"
              >
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {stripMarkdown(snippet(item.content, query))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* No results */}
      {query.trim() && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No results for "{query}"
        </p>
      )}

      {/* Regular doc tree — only when not searching */}
      {!query.trim() && children}
    </div>
  );
}
