'use client';

import { type ReactNode, useCallback } from 'react';

interface ReaderSidebarProps {
  sidebarOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
}

/**
 * Shared responsive sidebar shell for all readers (Notes, EPUB, Web).
 *
 * Large screens (≥1024px): fixed-width 16rem panel beside content.
 * Narrow screens (<1024px): slides in from the right as an overlay.
 */
export function ReaderSidebar({ sidebarOpen, onClose, children }: ReaderSidebarProps) {
  return (
    <>
      {/* Backdrop — narrow screens only */}
      {sidebarOpen && onClose && (
        <div
          className="hidden max-lg:block fixed inset-0 z-40 bg-black/30 max-lg:top-[121px]"
          onClick={onClose}
        />
      )}
      <aside
        className={`
          flex-shrink-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'lg:flex' : 'lg:hidden'}
          max-lg:fixed max-lg:top-[121px] max-lg:bottom-8 max-lg:z-50 max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:shadow-2xl
          ${sidebarOpen ? 'max-lg:right-4' : 'max-lg:right-0'}
          max-lg:${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          w-64 max-lg:w-80
        `}
      >
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </aside>
    </>
  );
}
