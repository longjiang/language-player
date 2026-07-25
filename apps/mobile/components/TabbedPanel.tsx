import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

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
 * Simple tabbed panel matching Next.js's TabbedPanel pattern.
 * Renders a row of tab buttons and only the active tab's content.
 */
export function TabbedPanel({ tabs, defaultTab, children }: TabbedPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.key ?? '');
  const childrenArray = React.Children.toArray(children);

  return (
    <View>
      {/* Tab bar */}
      <View className="flex-row border-b border-border">
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
      </View>

      {/* Active tab content */}
      {childrenArray.map((child, i) => {
        const tabKey = tabs[i]?.key;
        if (!tabKey || tabKey !== activeTab) return null;
        return <View key={tabKey}>{child}</View>;
      })}
    </View>
  );
}
