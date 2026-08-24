import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import * as Tabs from '@/components/ui/tabs';
import { tabbedPanelLogger } from '@/lib/logger';

const { log } = tabbedPanelLogger;

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
  /**
   * Whether the panel participates in a bounded flex layout. Keep this false
   * for content inside a vertical ScrollView so the active panel measures to
   * its children instead of collapsing to the available flex basis (zero).
   */
  fill?: boolean;
}

type DisplayMode = 'full' | 'compact' | 'icon';

/** Whether a tab shows its label in the given display mode. The active tab's
 *  label ALWAYS shows in full; the rest collapse to icon-only in compact mode. */
function shouldShowLabel(tab: TabDef, mode: DisplayMode, activeKey: string): boolean {
  if (!tab.icon) return true;
  return mode === 'full' || tab.key === activeKey;
}

/**
 * Hidden ruler that mirrors a tab trigger at its natural (unconstrained)
 * width, so the panel can measure each display mode — mirrors apps/web.
 */
function MeasureRow({
  tabs,
  mode,
  activeKey,
}: {
  tabs: TabDef[];
  mode: DisplayMode;
  activeKey: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
      {tabs.map((tab) => {
        const showLabel = shouldShowLabel(tab, mode, activeKey);
        return (
          <View
            key={tab.key}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 10 }}
          >
            {tab.icon ? <>{tab.icon()}</> : null}
            {showLabel && <Text style={{ fontSize: 14, fontWeight: '500' }}>{tab.label}</Text>}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Tabbed panel using @rn-primitives/tabs for proper ARIA roles,
 * keyboard navigation, and focus management.
 * Renders a row of tab buttons and only the active tab's content.
 *
 * Tab labels adapt to the available width (mirrors apps/web):
 *  - 'full'    every tab shows icon + label
 *  - 'compact' the active tab keeps its label, the rest collapse to icon-only
 *  - 'icon'    every tab collapses to icon-only
 * The widest mode that still fits is used (full → compact → icon).
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
  fill = false,
}: TabbedPanelProps) {
  const isControlled = controlledTab !== undefined;
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.key ?? '');
  const activeTab = isControlled ? controlledTab : internalTab;
  const childrenArray = React.Children.toArray(children);

  const [containerWidth, setContainerWidth] = useState(0);
  const [measurements, setMeasurements] = useState<{
    full: number;
    compact: number;
    icon: number;
  } | null>(null);
  const lastModeRef = useRef<DisplayMode | null>(null);

  const updateMeasurement = (key: 'full' | 'compact' | 'icon', width: number) => {
    setMeasurements((prev) => {
      if (prev && prev[key] === width) return prev;
      return { ...(prev ?? { full: 0, compact: 0, icon: 0 }), [key]: width };
    });
  };

  // Pick the widest mode that still fits. The +2px tolerance keeps the mode
  // from flapping at the exact boundary (mirrors apps/web). We only ever pick
  // 'full' or 'compact' — the active tab's label must ALWAYS show in full, so
  // there is no pure icon-only fallback (the previous 'icon' mode hid even the
  // current tab's label, which the user reported as truncation on narrow
  // screens).
  const mode: DisplayMode = useMemo(() => {
    if (!measurements || containerWidth === 0) return 'full';
    if (containerWidth + 2 >= measurements.full) return 'full';
    return 'compact';
  }, [measurements, containerWidth]);

  useEffect(() => {
    if (lastModeRef.current === mode) return;
    lastModeRef.current = mode;
    log('[TabbedPanel] mode selected', {
      tabs: tabs.map((tab) => tab.key),
      activeTab,
      fill,
      containerWidth,
      measurements,
      mode,
    });
  }, [activeTab, containerWidth, fill, measurements, mode, tabs]);

  const handleTabChange = (key: string) => {
    if (!isControlled) setInternalTab(key);
    onTabChange?.(key);
  };

  return (
    <Tabs.Root
      className={fill ? 'flex-1 min-h-0' : undefined}
      value={activeTab}
      onValueChange={handleTabChange}
    >
      <View
        className={className}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          log('[TabbedPanel] container layout', {
            tabs: tabs.map((tab) => tab.key),
            activeTab,
            fill,
            width,
            height,
          });
          setContainerWidth(width);
        }}
      >
        <Tabs.List>
          {tabs.map((tab) => {
            const showLabel = shouldShowLabel(tab, mode, activeTab);
            return (
              <Pressable
                key={tab.key}
                testID={`tab-${tab.key}`}
                onPress={() => handleTabChange(tab.key)}
                // Content-sized (no `flex-1`): the width-mode logic (full →
                // compact → icon) measures NATURAL widths, so the render must
                // match or a long active label truncates (the equal-width
                // flex-1 distribution gave the active tab only 1/N of the
                // container, clipping e.g. "让 DeepSeek 説"). Content-sized tabs
                // never truncate their label; the chosen mode guarantees the
                // bar fits.
                className={`items-center px-2 py-2.5 active:bg-muted ${
                  activeTab === tab.key ? 'border-b-2 border-primary' : ''
                }`}
              >
                <View className="flex-row items-center gap-1.5">
                  {tab.icon ? <>{tab.icon()}</> : null}
                  {showLabel && (
                    <Text
                      numberOfLines={1}
                      className={`text-sm font-medium ${
                        activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {tab.label}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </Tabs.List>

        {/* Tab content panels */}
        {tabs.map((tab, i) => (
          <Tabs.Content
            key={tab.key}
            value={tab.key}
            className={`${fill ? 'flex-1 min-h-0' : ''} ${contentClassName ?? 'p-4'}`.trim()}
            onLayout={(e) => {
              if (activeTab !== tab.key) return;
              const { width, height } = e.nativeEvent.layout;
              log('[TabbedPanel] content layout', { tab: tab.key, fill, width, height });
            }}
          >
            {childrenArray[i] as any}
          </Tabs.Content>
        ))}

        {/* Hidden rulers used only for width measurement — clipped and
            pointer-events off so they never affect layout or intercept taps. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: -10000, top: 0, opacity: 0 }}
        >
          <View
            onLayout={(e) => {
              const width = e.nativeEvent.layout.width;
              log('[TabbedPanel] ruler layout', { mode: 'full', width, activeTab });
              updateMeasurement('full', width);
            }}
          >
            <MeasureRow tabs={tabs} mode="full" activeKey={activeTab} />
          </View>
          <View
            onLayout={(e) => {
              const width = e.nativeEvent.layout.width;
              log('[TabbedPanel] ruler layout', { mode: 'compact', width, activeTab });
              updateMeasurement('compact', width);
            }}
          >
            <MeasureRow tabs={tabs} mode="compact" activeKey={activeTab} />
          </View>
          <View
            onLayout={(e) => {
              const width = e.nativeEvent.layout.width;
              log('[TabbedPanel] ruler layout', { mode: 'icon', width, activeTab });
              updateMeasurement('icon', width);
            }}
          >
            <MeasureRow tabs={tabs} mode="icon" activeKey={activeTab} />
          </View>
        </View>
      </View>
    </Tabs.Root>
  );
}
