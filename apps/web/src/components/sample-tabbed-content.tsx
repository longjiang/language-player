'use client';

import { useState, type ReactNode } from 'react';
import { TabbedPanel, type TabDef } from '@/components/tabbed-panel';

interface SampleTabbedContentProps {
  tabs: readonly TabDef[];
  renderContent: (activeTab: string) => ReactNode;
}

export function SampleTabbedContent({ tabs, renderContent }: SampleTabbedContentProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? '');

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      className="w-full max-w-3xl"
      contentClassName="overflow-y-auto p-6"
    >
      {renderContent(activeTab)}
    </TabbedPanel>
  );
}
