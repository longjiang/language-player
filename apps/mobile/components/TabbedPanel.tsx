import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Tabs from '@/components/ui/tabs';

export interface TabDef {
  key: string;
  label: string;
}

interface TabbedPanelProps {
  tabs: TabDef[];
  defaultTab?: string;
  children: React.ReactNode;
}

/**
 * Tabbed panel using @rn-primitives/tabs for proper ARIA roles,
 * keyboard navigation, and focus management.
 * Renders a row of tab buttons and only the active tab's content.
 */
export function TabbedPanel({ tabs, defaultTab, children }: TabbedPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.key ?? '');
  const childrenArray = React.Children.toArray(children);

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
      <Tabs.List>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`flex-1 items-center px-2 py-2.5 ${
              activeTab === tab.key ? 'border-b-2 border-primary' : ''
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </Tabs.List>

      {/* Tab content panels */}
      {tabs.map((tab, i) => (
        <Tabs.Content key={tab.key} value={tab.key}>
          {childrenArray[i] as any}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
