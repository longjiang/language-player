import React, { type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { TabbedPanel, type TabDef } from '../TabbedPanel';

interface TranscriptQueuePanelProps {
  transcript: ReactNode;
  queue: ReactNode;
  info?: ReactNode;
  defaultTab?: 'transcript' | 'queue' | 'info';
}

export function TranscriptQueuePanel({
  transcript,
  queue,
  info,
  defaultTab = 'transcript',
}: TranscriptQueuePanelProps) {
  const t = useT();

  const tabs: TabDef[] = [
    { key: 'transcript', label: t('title.transcript') },
    { key: 'queue', label: t('title.queue') },
  ];
  if (info) {
    tabs.push({ key: 'info', label: t('title.info') });
  }

  return (
    <TabbedPanel tabs={tabs} defaultTab={defaultTab}>
      {transcript}
      {queue}
      {info}
    </TabbedPanel>
  );
}
