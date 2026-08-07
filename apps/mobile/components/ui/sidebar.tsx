import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { PanelRightClose } from 'lucide-react-native';
import * as Dialog from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

/**
 * Shared right-side sidebar — mirrors apps/web/src/components/ui/sidebar.tsx.
 * Narrow screens render a slide-in sheet through Dialog.DrawerContent; wide
 * screens render a persistent collapsible panel.
 */

/** Width at which the sidebar switches from sheet to persistent panel. */
export const SIDEBAR_BREAKPOINT = 768;

/** Sheet width matching web's `w-80 max-w-[85vw]`. */
export function sidebarSheetWidth(screenWidth: number): number {
  return Math.min(320, screenWidth * 0.85);
}

export interface SidebarPanelProps {
  title: React.ReactNode;
  /** Optional actions rendered in the header before the close button. */
  headerActions?: React.ReactNode;
  /** When provided, renders the close button (sheet mode). */
  onClose?: () => void;
  /** Body content. When empty, `emptyState` is rendered instead. */
  children?: React.ReactNode;
  /** Shown in the scrollable body when there is no content. */
  emptyState?: React.ReactNode;
  /** Pinned below the scrollable body. */
  footer?: React.ReactNode;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  /** Extra classes for the header row. */
  headerClassName?: string;
}

/** Card chrome shared by the persistent panel and the slide-in sheet. */
export function SidebarPanel({
  title,
  headerActions,
  onClose,
  children,
  emptyState,
  footer,
  bodyClassName,
  headerClassName,
}: SidebarPanelProps) {
  const t = useT();
  return (
    <View className="h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <View className={`flex-row flex-wrap items-center gap-2 border-b border-border px-3 py-2 ${headerClassName ?? ''}`}>
        <Text className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground" numberOfLines={1}>
          {title}
        </Text>
        {headerActions && (
          <View className="flex-row items-center gap-1">{headerActions}</View>
        )}
        {onClose && (
          <Pressable
            onPress={onClose}
            className="rounded p-1 active:bg-muted"
            accessibilityLabel={t('action.close')}
          >
            <PanelRightClose size={16} color={ICON_MUTED} />
          </Pressable>
        )}
      </View>
      <ScrollView className={`flex-1 ${bodyClassName ?? 'px-1 py-1'}`}>
        {children ?? emptyState}
      </ScrollView>
      {footer && <View className="border-t border-border">{footer}</View>}
    </View>
  );
}

export interface SidebarProps extends SidebarPanelProps {
  /** Narrow screens: whether the slide-in sheet is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wide screens: whether the persistent right panel is expanded. */
  sidebarOpen: boolean;
  /** Classes applied to the persistent panel when expanded. */
  desktopClassName?: string;
}

/**
 * Shared right-side sidebar: a persistent collapsible panel on wide screens
 * and a slide-in sheet on narrow screens. Both render the same panel chrome.
 */
export function Sidebar({
  open,
  onOpenChange,
  sidebarOpen,
  desktopClassName = 'w-64 ml-3',
  ...panel
}: SidebarProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= SIDEBAR_BREAKPOINT;

  if (isWide) {
    return (
      <View
        className={sidebarOpen ? `flex-shrink-0 ${desktopClassName}` : 'overflow-hidden'}
        style={sidebarOpen ? undefined : { width: 0 }}
      >
        {sidebarOpen && <SidebarPanel {...panel} />}
      </View>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.DrawerContent className="p-0" drawerWidth={sidebarSheetWidth(screenWidth)}>
          <SidebarPanel {...panel} onClose={() => onOpenChange(false)} />
        </Dialog.DrawerContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * State shared by sidebar consumers: desktop persistent state + mobile sheet
 * state + a toggle that opens the sheet on narrow screens and collapses the
 * panel on wide screens (matches web's page-level behavior).
 */
export function useSidebar() {
  const { width } = useWindowDimensions();
  const isWide = width >= SIDEBAR_BREAKPOINT;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => {
    if (isWide) {
      setSidebarOpen((open) => !open);
    } else {
      setMobileOpen(true);
    }
  }, [isWide]);

  return {
    isWide,
    sidebarOpen,
    setSidebarOpen,
    mobileOpen,
    setMobileOpen,
    toggle,
  };
}
