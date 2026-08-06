'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

type DisplayMode = 'full' | 'compact' | 'icon';

/**
 * Hidden ruler that mirrors a tab trigger at its natural (unconstrained) width,
 * so we can measure how wide the bar would be in each display mode.
 * Mirrors the TabsTrigger's padding/border/gap so measurements are exact.
 */
function MeasureBar({
  tabs,
  mode,
  activeKey,
}: {
  tabs: readonly { key: string; label: string; icon?: ReactNode }[];
  mode: DisplayMode;
  activeKey?: string;
}) {
  return (
    <>
      {tabs.map((tab) => {
        const showLabel = mode === 'full' || (mode === 'compact' && tab.key === activeKey);
        return (
          <span
            key={tab.key}
            className="inline-flex items-center justify-center gap-1.5 border border-transparent px-1 py-1.5 text-sm font-medium whitespace-nowrap"
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            {showLabel && <span className="whitespace-nowrap">{tab.label}</span>}
          </span>
        );
      })}
    </>
  );
}

/**
 * A rounded panel with a tab bar at the top.
 * The parent controls which tab is active and renders the corresponding content as children.
 *
 * Tab labels adapt to the available width — decided by measuring the labels,
 * not a fixed breakpoint:
 *  - 'full'    every tab shows icon + label
 *  - 'compact' the active tab keeps its label, the rest collapse to icon-only
 *  - 'icon'    every tab collapses to icon-only
 * The widest mode that still fits is used (full → compact → icon).
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
  const containerRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const measureCompactRef = useRef<HTMLDivElement>(null);
  const measureIconRef = useRef<HTMLDivElement>(null);

  // Natural width of the tab bar in each mode, measured from the hidden rulers.
  const [measurements, setMeasurements] = useState<{
    full: number;
    compact: number;
    icon: number;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Consumers often rebuild the tabs array inline, so key on the actual
  // content and only re-measure when the set of tabs really changes.
  const tabsSignature = tabs.map((t) => `${t.key}\u0000${t.label}`).join('\u0001');

  // Re-measure the rulers whenever the tab set or the active tab changes.
  useLayoutEffect(() => {
    if (!measureFullRef.current || !measureCompactRef.current || !measureIconRef.current) return;
    setMeasurements({
      full: measureFullRef.current.scrollWidth,
      compact: measureCompactRef.current.scrollWidth,
      icon: measureIconRef.current.scrollWidth,
    });
  }, [tabsSignature, activeTab]);

  // Track the container width (read once on mount so the first paint already
  // uses the right mode — no flash of full labels).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pick the widest mode that still fits. The +2px tolerance keeps the mode
  // from flapping at the exact boundary.
  const mode: DisplayMode = useMemo(() => {
    if (!measurements) return 'full';
    if (containerWidth + 2 >= measurements.full) return 'full';
    if (containerWidth + 2 >= measurements.compact) return 'compact';
    return 'icon';
  }, [measurements, containerWidth]);

  return (
    <div ref={containerRef} className={cn('relative flex flex-col rounded-xl border border-border bg-card', className)}>
      {/* Tab bar — Radix Tabs provides keyboard nav and ARIA roles */}
      <Tabs value={activeTab} onValueChange={(v) => onTabClick ? onTabClick(v as T) : onTabChange(v as T)} className="flex-1 min-h-0 flex-col">
        <TabsList className="border-b border-border w-full">
          {tabs.map((tab) => {
            const showLabel = mode === 'full' || (mode === 'compact' && tab.key === activeTab);
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="flex-1">
                {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                {showLabel && <span className="truncate min-w-0">{tab.label}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value={activeTab} className={contentClassName}>
          {children}
        </TabsContent>
      </Tabs>

      {/* Hidden rulers used only for width measurement. Absolute + clipped so
          they never affect layout or create scrollbars; pointer-events off so
          they never intercept clicks. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={measureFullRef} className="invisible flex w-max flex-nowrap">
          <MeasureBar tabs={tabs} mode="full" activeKey={activeTab} />
        </div>
        <div ref={measureCompactRef} className="invisible flex w-max flex-nowrap">
          <MeasureBar tabs={tabs} mode="compact" activeKey={activeTab} />
        </div>
        <div ref={measureIconRef} className="invisible flex w-max flex-nowrap">
          <MeasureBar tabs={tabs} mode="icon" />
        </div>
      </div>
    </div>
  );
}
