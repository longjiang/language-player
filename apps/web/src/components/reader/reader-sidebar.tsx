'use client';

import type { ReactNode } from 'react';

interface ReaderSidebarProps {
  sidebarOpen: boolean;
  children: ReactNode;
}

/**
 * Shared responsive sidebar shell for all readers (Notes, EPUB, Web).
 *
 * Large screens (≥1024px): fixed-width 16rem panel beside content.
 * Narrow screens (<1024px): full-width fixed overlay anchored below the
 * site header (top-14 = 56px). A backdrop overlay sits behind it.
 * When closed, returns null.
 */
export function ReaderSidebar({ sidebarOpen, children }: ReaderSidebarProps) {
  if (!sidebarOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="max-lg:fixed max-lg:inset-0 max-lg:top-14 max-lg:z-30 max-lg:bg-black/30" />
      {/* Sidebar panel */}
      <aside className="w-64 flex-shrink-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden max-lg:fixed max-lg:inset-0 max-lg:top-14 max-lg:z-40 max-lg:w-full max-lg:rounded-none">
        {children}
      </aside>
    </>
  );
}
