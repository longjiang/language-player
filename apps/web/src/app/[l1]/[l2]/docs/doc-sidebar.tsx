'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { List, ChevronDown, Search } from 'lucide-react';
import { useT } from '@/hooks/use-t';

interface TocItem {
  level: number;
  text: string;
  id: string;
}

interface DocMeta {
  slug: string;
  title: string;
  children?: DocMeta[];
}

interface DocEntry {
  slug: string;
  title: string;
  content: string;
}

/** Derives the translation key for a category folder slug. */
function categoryKey(slug: string): string {
  return `title.${slug}`;
}

/** Renders a doc link (leaf node) with optional active highlight. */
function DocLink({ href, title, active, onClick }: { href: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block rounded px-2 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {title}
    </Link>
  );
}

/** Renders a category node (expandable). Auto-expands if any child is active. */
function DocCategory({ category, l1, l2, currentSlug, onClick }: {
  category: DocMeta;
  l1: string;
  l2: string;
  currentSlug: string;
  onClick: () => void;
}) {
  const t = useT();
  const hasActiveChild = category.children?.some(
    c => c.slug === currentSlug || c.children?.some(cc => cc.slug === currentSlug)
  );
  const [expanded, setExpanded] = useState(!!hasActiveChild);
  const key = categoryKey(category.slug);
  const translated = t(key);
  // Fall back to server-provided title if no translation exists for this key
  const title = translated !== key ? translated : category.title;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`} />
        {title}
      </button>
      {expanded && category.children && (
        <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
          {category.children.map(child => {
            if (child.children && child.children.length > 0) {
              return (
                <li key={child.slug}>
                  <DocCategory category={child} l1={l1} l2={l2} currentSlug={currentSlug} onClick={onClick} />
                </li>
              );
            }
            const href = `/${l1}/${l2}/docs/${child.slug}`;
            return (
              <li key={child.slug}>
                <DocLink href={href} title={child.title} active={child.slug === currentSlug} onClick={onClick} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DocSidebar({ toc, docs, l1, l2, currentSlug, searchIndex }: {
  toc: TocItem[];
  docs: DocMeta[];
  l1: string;
  l2: string;
  currentSlug: string;
  searchIndex: DocEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const fuse = useMemo(
    () => new Fuse(searchIndex, { keys: ['title', 'content'], threshold: 0.4, includeScore: true }),
    [searchIndex],
  );

  const results = query.trim() ? fuse.search(query).slice(0, 8) : [];
  const isSearching = query.trim().length > 0;

  if (toc.length === 0 && docs.length === 0) return null;

  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-[4.25rem] right-4 z-50 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:hidden"
        aria-label="Table of contents"
      >
        <List className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 top-14 z-40 bg-black/30 xl:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`
          fixed top-14 right-0 bottom-0 z-40 w-64 overflow-y-auto border-l border-border bg-background p-4 shadow-lg
          transition-transform duration-200
          xl:sticky xl:top-20 xl:z-0 xl:w-56 xl:translate-x-0 xl:border xl:rounded-lg xl:shadow-none xl:shrink-0 xl:self-start
          ${open ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'}
        `}
      >
        <nav className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search docs…"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Search results */}
          {isSearching && results.length > 0 && (
            <ul className="space-y-1">
              {results.map(({ item }) => (
                <li key={item.slug}>
                  <Link
                    href={`/${l1}/${l2}/docs/${item.slug}`}
                    onClick={close}
                    className="block rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-1">
                      {item.content.slice(0, 80)}…
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {isSearching && results.length === 0 && (
            <p className="text-xs text-muted-foreground px-2">No results</p>
          )}

          {/* Regular sidebar content (hidden when searching) */}
          {!isSearching && (
            <>
              {/* All docs tree */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Table of contents
                </h4>
                <ul className="space-y-0.5">
                  {docs.map(doc => {
                    if (doc.children && doc.children.length > 0) {
                      return (
                        <li key={doc.slug}>
                          <DocCategory category={doc} l1={l1} l2={l2} currentSlug={currentSlug} onClick={close} />
                        </li>
                      );
                    }
                    const href = `/${l1}/${l2}/docs/${doc.slug}`;
                    return (
                      <li key={doc.slug}>
                        <DocLink href={href} title={doc.title} active={doc.slug === currentSlug} onClick={close} />
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* On this page headings */}
              {toc.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    On this page
                  </h4>
                  <ul className="space-y-0.5 border-l border-border/50 pl-2">
                    {toc.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          onClick={close}
                          className="block rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          style={{ paddingLeft: `${(item.level - 2) * 0.75 + 0.25}rem` }}
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
