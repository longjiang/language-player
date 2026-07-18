'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { FileText, ListVideo } from 'lucide-react';
import { TabbedPanel } from '@/components/tabbed-panel';

interface TranscriptQueuePanelProps {
  transcript: ReactNode;
  queue: ReactNode;
  className?: string;
  defaultTab?: 'transcript' | 'queue';
  /** Ref to the scrollable content container — pass to subtitle display for smart scrolling */
  contentRef?: React.RefObject<HTMLDivElement | null>;
}

const TABS = [
  { key: 'transcript', icon: <FileText className="h-4 w-4" /> },
  { key: 'queue', icon: <ListVideo className="h-4 w-4" /> },
] as const;

export function TranscriptQueuePanel({
  transcript,
  queue,
  className,
  defaultTab = 'transcript',
  contentRef: externalRef,
}: TranscriptQueuePanelProps) {
  const [tab, setTab] = useState<'transcript' | 'queue'>(defaultTab);
  const t = useT();
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = externalRef ?? internalRef;

  // Callback ref to satisfy TypeScript's strict ref typing
  const setRef = useCallback((node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [ref]);

  return (
    <TabbedPanel
      tabs={TABS.map(tab => ({ ...tab, label: t(`title.${tab.key}`) }))}
      activeTab={tab}
      onTabChange={setTab}
      className={cn('min-h-0 h-full', className)}
      contentClassName="overflow-y-auto p-4"
    >
      <div ref={setRef} className="h-full">
        {tab === 'transcript' ? transcript : queue}
      </div>
    </TabbedPanel>
  );
}
