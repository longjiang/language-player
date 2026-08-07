import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Tabs from '@/components/ui/tabs';

export interface TabDef {
  key: string;
  label: string;
  /** Render prop for an icon. Called inline inside the tab button. */
  icon?: () => React.ReactNode;
}

interface TabbedPanelProps {
  tabs: TabDef[];
  defaultTab?: string;
  /** Controlled active tab. When provided, parent must manage state. */
  activeTab?: string;
  /** Called when active tab changes (controlled mode). */
  onTabChange?: (key: string) => void;
  children: React.ReactNode;
  /** Class name for the outer container. */
  className?: string;
  /** Class name for the content panel. */
  contentClassName?: string;
}

/**
 * Tabbed panel using @rn-primitives/tabs for proper ARIA roles,
 * keyboard navigation, and focus management.
 * Renders a row of tab buttons and only the active tab's content.
 *
 * Supports both controlled (activeTab + onTabChange) and uncontrolled (defaultTab) modes.
 * Accepts className and contentClassName for custom styling (e.g., embedded mode).
 */
export function TabbedPanel({
  tabs,
  defaultTab,
  activeTab: controlledTab,
  onTabChange,
  children,
  className,
  contentClassName,
}: TabbedPanelProps) {
  const isControlled = controlledTab !== undefined;
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.key ?? '');
  const activeTab = isControlled ? controlledTab : internalTab;
  const childrenArray = React.Children.toArray(children);

  const handleTabChange = (key: string) => {
    if (!isControlled) setInternalTab(key);
    onTabChange?.(key);
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
      <View className={className}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              testID={`tab-${tab.key}`}
              onPress={() => handleTabChange(tab.key)}
              className={`flex-1 items-center px-2 py-2.5 ${
                activeTab === tab.key ? 'border-b-2 border-primary' : ''
              }`}
            >
              <View className="flex-row items-center gap-1.5">
                {tab.icon ? <>{tab.icon()}</> : null}
                <Text
                  className={`text-xs font-medium ${
                    activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {tab.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </Tabs.List>

        {/* Tab content panels */}
        {tabs.map((tab, i) => (
          <Tabs.Content key={tab.key} value={tab.key} className={contentClassName}>
            {childrenArray[i] as any}
          </Tabs.Content>
        ))}
      </View>
    </Tabs.Root>
  );
}
