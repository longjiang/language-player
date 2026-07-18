'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabDef {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface TabbedPanelProps {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
  /** Optional per-tab click override. When provided, called instead of onTabChange. */
  onTabClick?: (key: string) => void;
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
export function TabbedPanel({
  tabs,
  activeTab,
  onTabChange,
  onTabClick,
  children,
  className,
  contentClassName,
}: TabbedPanelProps) {
  return (
    <div className={cn('flex flex-col rounded-xl border border-border bg-card', className)}>
      {/* Tab bar */}
      <div className="flex shrink-0 justify-between border-b border-border">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => onTabClick ? onTabClick(tab.key) : onTabChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
              i === 0 && 'pl-0',
              i === tabs.length - 1 && 'pr-0',
              activeTab === tab.key
                ? 'border-b-2 border-primary -mb-px text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={cn('min-h-0 flex-1', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
