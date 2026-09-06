import React, { useState, type ReactNode } from 'react';
import { FileText, ListVideo, Info, Sparkles } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TabbedPanel, type TabDef } from '../TabbedPanel';

export type TranscriptQueueTab = 'transcript' | 'queue' | 'info' | 'ai';

interface TranscriptQueuePanelProps {
  transcript: ReactNode;
  queue: ReactNode;
  /** Optional video info content — shown as a third tab on narrow screens. */
  info?: ReactNode;
  /** Optional video "Ask AI" chat — shown as an extra tab. */
  askAi?: ReactNode;
  className?: string;
  defaultTab?: TranscriptQueueTab;
  /** Controlled active tab. When provided, the parent owns tab state. */
  activeTab?: TranscriptQueueTab;
  onTabChange?: (key: TranscriptQueueTab) => void;
}

export function TranscriptQueuePanel({
  transcript,
  queue,
  info,
  askAi,
  className,
  defaultTab = 'transcript',
  activeTab: controlledTab,
  onTabChange,
}: TranscriptQueuePanelProps) {
  const t = useT();
  const [internalTab, setInternalTab] = useState<TranscriptQueueTab>(defaultTab);
  const tab = controlledTab ?? internalTab;

  const tabs: TabDef[] = [
    { key: 'transcript', label: t('title.transcript'), icon: () => <FileText size={14} color={ICON_MUTED} /> },
    { key: 'queue', label: t('title.queue'), icon: () => <ListVideo size={14} color={ICON_MUTED} /> },
  ];
  if (askAi) {
    tabs.push({ key: 'ai', label: t('action.ask_ai'), icon: () => <Sparkles size={14} color={ICON_MUTED} /> });
  }
  if (info) {
    tabs.push({ key: 'info', label: t('title.info'), icon: () => <Info size={14} color={ICON_MUTED} /> });
  }

  const handleTabChange = (key: string) => {
    const next = key as TranscriptQueueTab;
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={tab}
      onTabChange={handleTabChange}
      fill
      className={`h-full min-h-0 ${className ?? ''}`}
      contentClassName="min-h-0 p-4"
    >
      {transcript}
      {queue}
      {askAi}
      {info}
    </TabbedPanel>
  );
}
