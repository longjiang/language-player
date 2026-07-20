'use client';

import { useState } from 'react';
import { List } from 'lucide-react';

interface TocItem {
  level: number;
  text: string;
  id: string;
}

export function DocSidebar({ toc }: { toc: TocItem[] }) {
  const [open, setOpen] = useState(false);

  if (toc.length === 0) return null;

  return (
    <>
      {/* Toggle button — visible on narrow screens */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg xl:hidden"
        aria-label="Table of contents"
      >
        <List className="h-5 w-5" />
      </button>

      {/* Overlay — narrow screens only, below header */}
      {open && (
        <div
          className="fixed inset-0 top-14 z-40 bg-black/30 xl:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-14 right-0 bottom-0 z-40 w-64 overflow-y-auto border-l border-border bg-background p-4 shadow-lg
          transition-transform duration-200
          xl:sticky xl:top-20 xl:z-0 xl:w-56 xl:translate-x-0 xl:border xl:rounded-lg xl:shadow-none xl:shrink-0 xl:self-start
          ${open ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'}
        `}
      >
        {/* Header */}
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </h4>

        <nav>
          <ul className="space-y-1">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  style={{ paddingLeft: item.level === 3 ? '1.25rem' : '0.25rem' }}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
