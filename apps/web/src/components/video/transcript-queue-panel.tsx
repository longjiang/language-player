'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { FileText, ListVideo, Info } from 'lucide-react';
import { TabbedPanel } from '@/components/tabbed-panel';

interface TranscriptQueuePanelProps {
  transcript: ReactNode;
  queue: ReactNode;
  /** Optional video info content — shown as a third tab on narrow screens */
  info?: ReactNode;
  className?: string;
  defaultTab?: 'transcript' | 'queue' | 'info';
  /** Ref to the scrollable content container — pass to subtitle display for smart scrolling */
  contentRef?: React.RefObject<HTMLDivElement | null>;
}

type TabKey = 'transcript' | 'queue' | 'info';

export function TranscriptQueuePanel({
  transcript,
  queue,
  info,
  className,
  defaultTab = 'transcript',
  contentRef: externalRef,
}: TranscriptQueuePanelProps) {
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const t = useT();
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = externalRef ?? internalRef;

  // Callback ref to satisfy TypeScript's strict ref typing
  const setRef = useCallback((node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [ref]);

  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: 'transcript', label: t('title.transcript'), icon: <FileText className="h-4 w-4" /> },
    { key: 'queue', label: t('title.queue'), icon: <ListVideo className="h-4 w-4" /> },
  ];
  if (info) {
    tabs.push({ key: 'info', label: t('title.info'), icon: <Info className="h-4 w-4" /> });
  }

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      className={cn('min-h-0 h-full', className)}
      contentClassName="overflow-y-auto p-4"
    >
      <div ref={setRef} className="h-full">
        {tab === 'transcript' && transcript}
        {tab === 'queue' && queue}
        {tab === 'info' && info}
      </div>
    </TabbedPanel>
  );
}
