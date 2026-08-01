'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export interface SidebarPanelProps {
  title: React.ReactNode;
  /** Optional actions rendered in the header before the close button. */
  headerActions?: React.ReactNode;
  /** When provided, renders the close button (mobile sheet). */
  onClose?: () => void;
  /** Body content. When empty, `emptyState` is rendered instead. */
  children?: React.ReactNode;
  /** Shown in the scrollable body when there is no content. */
  emptyState?: React.ReactNode;
  /** Pinned below the scrollable body. */
  footer?: React.ReactNode;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  /** Extra classes for the header row. */
  headerClassName?: string;
}

/**
 * Card chrome shared by the desktop panel and the mobile sheet:
 * header (title + actions + close), scrollable body, pinned footer.
 */
export function SidebarPanel({
  title,
  headerActions,
  onClose,
  children,
  emptyState,
  footer,
  bodyClassName,
  headerClassName,
}: SidebarPanelProps) {
  const t = useT();
  return (
    <div className="w-full rounded-xl border border-border bg-card h-full flex flex-col overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-b border-border px-3 py-2',
          headerClassName,
        )}
      >
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
        {headerActions && (
          <div className="ml-auto flex items-center gap-1">{headerActions}</div>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              'flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
              !headerActions && 'ml-auto',
            )}
            aria-label={t('action.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className={cn('flex-1 overflow-y-auto px-1 py-1', bodyClassName)}>
        {children ?? emptyState}
      </div>
      {footer && <div className="border-t border-border">{footer}</div>}
    </div>
  );
}

export interface SidebarProps extends SidebarPanelProps {
  /** Mobile: whether the slide-in sheet is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop: whether the persistent right panel is expanded. */
  sidebarOpen: boolean;
  /** Classes applied to the desktop aside when expanded. */
  desktopClassName?: string;
}

/**
 * Shared right-side sidebar: a persistent collapsible panel on desktop and a
 * Radix Dialog sheet on mobile (focus trap, scroll lock, Escape, backdrop
 * dismiss). Both render the same panel chrome so all sidebars look identical.
 */
export function Sidebar({
  open,
  onOpenChange,
  sidebarOpen,
  desktopClassName = 'w-64 ml-3',
  ...panel
}: SidebarProps) {
  return (
    <>
      {/* Desktop: persistent collapsible panel */}
      <aside
        className={cn(
          'hidden lg:flex flex-shrink-0 transition-all duration-200',
          sidebarOpen ? desktopClassName : 'lg:w-0 overflow-hidden',
        )}
      >
        <SidebarPanel {...panel} />
      </aside>

      {/* Mobile: Radix Dialog sheet */}
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/10 duration-200 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex h-full w-80 max-w-[85vw] flex-col bg-background shadow-lg outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full"
          >
            <Dialog.Title className="sr-only">{panel.title}</Dialog.Title>
            <SidebarPanel {...panel} onClose={() => onOpenChange(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
