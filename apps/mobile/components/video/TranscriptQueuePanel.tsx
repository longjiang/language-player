import React, { useState, type ReactNode } from 'react';
import { FileText, ListVideo, Info } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TabbedPanel, type TabDef } from '../TabbedPanel';

interface TranscriptQueuePanelProps {
  transcript: ReactNode;
  queue: ReactNode;
  /** Optional video info content — shown as a third tab on narrow screens. */
  info?: ReactNode;
  className?: string;
  defaultTab?: 'transcript' | 'queue' | 'info';
}

export function TranscriptQueuePanel({
  transcript,
  queue,
  info,
  className,
  defaultTab = 'transcript',
}: TranscriptQueuePanelProps) {
  const t = useT();
  const [tab, setTab] = useState(defaultTab);

  const tabs: TabDef[] = [
    { key: 'transcript', label: t('title.transcript'), icon: () => <FileText size={14} color={ICON_MUTED} /> },
    { key: 'queue', label: t('title.queue'), icon: () => <ListVideo size={14} color={ICON_MUTED} /> },
  ];
  if (info) {
    tabs.push({ key: 'info', label: t('title.info'), icon: () => <Info size={14} color={ICON_MUTED} /> });
  }

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={tab}
      onTabChange={(key) => setTab(key as 'transcript' | 'queue' | 'info')}
      className={`h-full min-h-0 ${className ?? ''}`}
      contentClassName="min-h-0 p-4"
    >
      {transcript}
      {queue}
      {info}
    </TabbedPanel>
  );
}
