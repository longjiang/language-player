'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
  icon?: ReactNode;
}

interface TabbedPanelProps<T extends string = string> {
  tabs: readonly TabDef<T>[];
  activeTab: T;
  onTabChange: (key: T) => void;
  /** Optional per-tab click override. When provided, called instead of onTabChange. */
  onTabClick?: (key: T) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * A rounded panel with a tab bar at the top.
 * The parent controls which tab is active and renders the corresponding content as children.
 *
 * Usage:
 * ```tsx
 * const [tab, setTab] = useState('one');
 * <TabbedPanel
 *   tabs={[{ key: 'one', label: 'Tab One' }, { key: 'two', label: 'Tab Two' }]}
 *   activeTab={tab}
 *   onTabChange={setTab}
 * >
 *   {tab === 'one' && <div>Content one</div>}
 *   {tab === 'two' && <div>Content two</div>}
 * </TabbedPanel>
 * ```
 */
export function TabbedPanel<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  onTabClick,
  children,
  className,
  contentClassName,
}: TabbedPanelProps<T>) {
  return (
    <div className={cn('flex flex-col rounded-xl border border-border bg-card', className)}>
      {/* Tab bar — uses @base-ui/react/tabs for keyboard nav and ARIA roles */}
      <Tabs value={activeTab} onValueChange={(v) => onTabClick ? onTabClick(v as T) : onTabChange(v as T)} className="flex-col">
        <TabsList className="border-b border-border w-full">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="flex-1">
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={activeTab} className={contentClassName}>
          {children}
        </TabsContent>
      </Tabs>
    </div>
  );
}
