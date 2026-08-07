import React, { type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { TabbedPanel, type TabDef } from '../TabbedPanel';

interface TranscriptQueuePanelProps {
  video?: ReactNode;
  transcript: ReactNode;
  queue: ReactNode;
  info?: ReactNode;
  defaultTab?: 'video' | 'transcript' | 'queue' | 'info';
}

export function TranscriptQueuePanel({
  video,
  transcript,
  queue,
  info,
  defaultTab = 'video',
}: TranscriptQueuePanelProps) {
  const t = useT();

  const tabs: TabDef[] = [
    { key: 'video', label: t('title.video') },
    { key: 'transcript', label: t('title.transcript') },
    { key: 'queue', label: t('title.queue') },
  ];
  if (info) {
    tabs.push({ key: 'info', label: t('title.info') });
  }

  return (
    <TabbedPanel tabs={tabs} defaultTab={defaultTab}>
      {video}
      {transcript}
      {queue}
      {info}
    </TabbedPanel>
  );
}
