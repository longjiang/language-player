'use client';

import React, { useState } from 'react';
import { List } from 'lucide-react';
import type { TocTree } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { TextbookToc, useCurrentTaskId } from './textbook-toc';

interface TextbookTocSidebarProps {
  tree: TocTree;
  l1: string;
  l2: string;
}

/**
 * The task TOC as a right-hand sidebar, mirroring the docs sidebar
 * (`apps/web/src/app/docs/doc-sidebar.tsx`): a sticky column from `xl` up, and an
 * off-canvas drawer opened by a toggle button below it, because a tablet has no
 * room for a persistent 14rem column beside a task.
 *
 * **Rendered only on a task route.** Opening a book lands on its full TOC list
 * (`[bookId]/page.tsx`), and a list of units → lessons → tasks with the same list
 * in a second column beside it is the same information twice — the docs UI draws
 * the line the same way: `/docs` is the list, `/docs/<slug>` gets the sidebar.
 *
 * The open/closed state is deliberately not persisted: the drawer is a small-screen
 * affordance, and reopening a task should show the student the content, not the
 * navigation they just used.
 */
export function TextbookTocSidebar({ tree, l1, l2 }: TextbookTocSidebarProps) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const currentTaskId = useCurrentTaskId(tree, l1, l2);

  if (!currentTaskId) return null;

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed top-[4.25rem] right-4 z-50 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:hidden"
        aria-label={t('docs.table_of_contents')}
        aria-expanded={open}
      >
        <List className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 top-14 z-40 bg-black/30 xl:hidden" onClick={close} />
      )}

      <aside
        className={`
          fixed top-14 right-0 bottom-0 z-40 w-64 overflow-y-auto border-l border-border bg-background p-4 shadow-lg
          transition-transform duration-200
          xl:sticky xl:top-20 xl:z-0 xl:w-56 xl:translate-x-0 xl:border xl:rounded-lg xl:shadow-none xl:shrink-0 xl:self-start
          ${open ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'}
        `}
      >
        <TextbookToc tree={tree} l1={l1} l2={l2} onNavigate={close} />
      </aside>
    </>
  );
}
