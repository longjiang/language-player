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
 * Narrow screens (<1024px): full-width section above content.
 * When closed, returns null.
 */
export function ReaderSidebar({ sidebarOpen, children }: ReaderSidebarProps) {
  if (!sidebarOpen) return null;

  return (
    <aside className="w-64 flex-shrink-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden max-lg:w-full max-lg:mb-4">
      {children}
    </aside>
  );
}
