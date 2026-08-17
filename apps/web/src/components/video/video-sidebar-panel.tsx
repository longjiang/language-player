'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TabbedPanel } from '@/components/tabbed-panel';

/** Tab keys shared by the watch page and subs search sidebars. */
export type SidebarTabKey = 'subs' | 'queue' | 'info';

export interface SidebarTabDef {
  key: SidebarTabKey;
  label: string;
  icon?: ReactNode;
}

interface VideoSidebarPanelProps {
  tabs: SidebarTabDef[];
  defaultTab?: SidebarTabKey;
  /** Controlled active tab — when provided, the parent owns the tab state
   *  (e.g. subs search jumps to the queue tab from the nav "list all" button). */
  activeTab?: SidebarTabKey;
  onTabChange?: (key: SidebarTabKey) => void;
  /** Ref to the scrollable content container — pass to subtitle display for smart scrolling */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  /** Renders the content of the currently active tab. Only the active tab's
   *  content is mounted, so switching tabs unmounts the previous one. */
  children: (tab: SidebarTabKey) => ReactNode;
}

/**
 * The shared tabbed sidebar for the video watch page and subs search results.
 * Replaces the old `TranscriptQueuePanel`; tabs are configurable so each page
 * picks its own labels/icons ('subs', 'queue', 'info').
 */
export function VideoSidebarPanel({
  tabs,
  defaultTab = 'subs',
  activeTab: controlledTab,
  onTabChange,
  contentRef: externalRef,
  className,
  children,
}: VideoSidebarPanelProps) {
  const [internalTab, setInternalTab] = useState<SidebarTabKey>(defaultTab);
  const tab = controlledTab ?? internalTab;
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = externalRef ?? internalRef;

  // Callback ref to satisfy TypeScript's strict ref typing
  const setRef = useCallback((node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [ref]);

  const handleTabChange = useCallback((key: SidebarTabKey) => {
    if (onTabChange) onTabChange(key);
    else setInternalTab(key);
  }, [onTabChange]);

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={tab}
      onTabChange={handleTabChange}
      className={cn('min-h-0 h-full', className)}
      contentClassName="overflow-y-auto p-4"
    >
      <div ref={setRef} className="h-full">
        {children(tab)}
      </div>
    </TabbedPanel>
  );
}
