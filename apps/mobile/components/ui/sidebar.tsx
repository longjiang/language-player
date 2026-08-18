import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Modal, Animated, useWindowDimensions } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanelRightClose } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { LG_BREAKPOINT } from '@/lib/constants';

/**
 * Shared right-side sidebar — mirrors apps/web/src/components/ui/sidebar.tsx.
 * Narrow screens render a slide-in sheet in an RN Modal (see SidebarSheet —
 * NOT the Dialog portal, whose host is outside the navigation context); wide
 * screens render a persistent collapsible panel.
 *
 * Layout rule (matches web): the sidebar never touches the screen edges —
 * the sheet floats inside the safe area with a margin on every side, and the
 * desktop panel sits inset from the content row with vertical margins.
 */

/** Width at which the sidebar switches from sheet to persistent panel. */
export const SIDEBAR_BREAKPOINT = LG_BREAKPOINT;

/** Margin (px) kept between the sidebar and the screen edges. */
export const SIDEBAR_EDGE_MARGIN = 8;

/** Sheet width matching web's `w-80 max-w-[85vw]`. */
export function sidebarSheetWidth(screenWidth: number): number {
  return Math.min(320, screenWidth * 0.85);
}

export interface SidebarPanelProps {
  /** Optional panel title; the header row is hidden when there is no title/actions/close button. */
  title?: React.ReactNode;
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
  const insets = useSafeAreaInsets();
  const showHeader = Boolean(title || headerActions || onClose);
  return (
    <View className="h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {showHeader && (
        <View
          className={`flex-row flex-wrap items-center gap-2 border-b border-border px-3 py-2 ${headerClassName ?? ''}`}
          style={onClose ? { paddingTop: insets.top + 8 } : undefined}
        >
          {title && (
            <Text className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground" numberOfLines={1}>
              {title}
            </Text>
          )}
          {headerActions && (
            <View className="flex-row items-center gap-1">{headerActions}</View>
          )}
          {onClose && (
            <Pressable
              onPress={onClose}
              className={`rounded p-1 active:bg-muted ${!headerActions ? 'ml-auto' : ''}`}
              accessibilityLabel={t('action.close')}
            >
              <PanelRightClose size={16} color={ICON_MUTED} />
            </Pressable>
          )}
        </View>
      )}
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
 * Narrow-screen slide-in drawer — rendered in an RN `Modal`, NOT the Dialog
 * portal. The @rn-primitives/portal (Zustand-based) renders content at the
 * root `PortalHost` (app/_layout.tsx), which sits OUTSIDE the expo-router
 * navigator's per-screen context — portal content crashes with "Couldn't find
 * a navigation context" the moment anything (app hook or react-navigation
 * library code) touches navigation state. RN Modal children render inside the
 * screen's React tree, keeping full navigation context (SPEC-023 fixed
 * HamburgerDrawer the same way).
 */
function SidebarSheet({
  open,
  onClose,
  drawerWidth,
  children,
}: {
  open: boolean;
  onClose: () => void;
  drawerWidth: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Hidden position: fully off the right edge — the resting position is
  // `right: SIDEBAR_EDGE_MARGIN`, so slide by width + margin + a little extra
  // to guarantee the floating panel is completely off-screen.
  const hiddenX = drawerWidth + SIDEBAR_EDGE_MARGIN + 16;
  const translateX = useRef(new Animated.Value(hiddenX)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : hiddenX,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: open ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, overlayOpacity, hiddenX]);

  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      {/* Semi-transparent overlay — tap to close */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        className="absolute inset-0 bg-black/20"
        style={{ opacity: overlayOpacity }}
      >
        <Pressable className="flex-1" onPress={onClose} />
      </Animated.View>

      {/* Floating drawer panel — inset from every screen edge (safe-area
          aware) with rounded corners, so it never touches the screen edges
          (web parity: the sidebar sits inside the page margins). The inner
          SidebarPanel owns the border + rounded-xl; this wrapper only adds
          the drop shadow and the same corner radius for Android elevation. */}
      <Animated.View
        className="absolute bg-card"
        style={{
          top: insets.top + SIDEBAR_EDGE_MARGIN,
          bottom: insets.bottom + SIDEBAR_EDGE_MARGIN,
          right: SIDEBAR_EDGE_MARGIN,
          width: drawerWidth,
          borderRadius: 12,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 12,
          transform: [{ translateX }],
        }}
      >
        {children}
      </Animated.View>
    </Modal>
  );
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
        className={sidebarOpen ? `flex-shrink-0 py-2 ${desktopClassName}` : 'overflow-hidden'}
        style={sidebarOpen ? undefined : { width: 0 }}
      >
        {sidebarOpen && <SidebarPanel {...panel} />}
      </View>
    );
  }

  return (
    <SidebarSheet
      open={open}
      onClose={() => onOpenChange(false)}
      drawerWidth={sidebarSheetWidth(screenWidth)}
    >
      <SidebarPanel {...panel} onClose={() => onOpenChange(false)} />
    </SidebarSheet>
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
