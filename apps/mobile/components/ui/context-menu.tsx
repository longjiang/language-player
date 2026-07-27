import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY, ICON_DESTRUCTIVE } from '@/lib/theme-colors';

// ── Types ────────────────────────────────────

export interface ContextMenuItem {
  /** Unique key for the item (used as React key). */
  key: string;
  /** Icon component to display. */
  icon?: React.ComponentType<{ size: number; color: string }>;
  /** Label text. */
  label: string;
  /** Called when the item is pressed. */
  onPress: () => void;
  /** If true, renders with destructive styling (red text). */
  destructive?: boolean;
  /** If true, shows a spinner and disables the item. */
  loading?: boolean;
  /** If true, disables the item (greyed out, not pressable). */
  disabled?: boolean;
}

export interface ContextMenuProps {
  /** Menu items to display in the bottom sheet. */
  items: ContextMenuItem[];

  // ── Controlled mode (optional) ──
  /** Whether the menu is open. When provided, component is controlled. */
  open?: boolean;
  /** Called when the menu should open or close. Required for controlled mode. */
  onOpenChange?: (open: boolean) => void;

  // ── Trigger customization ──
  /** Override the default MoreVertical trigger icon. */
  triggerIcon?: React.ComponentType<{ size: number; color: string }>;
  /** Icon size for the trigger. Default: 14. */
  triggerSize?: number;
  /** Icon color for the trigger. Default: ICON_MUTED. */
  triggerColor?: string;
  /** Additional class names for the trigger Pressable. */
  triggerClassName?: string;
  /** Hit slop for the trigger Pressable. Default: 6. */
  triggerHitSlop?: number;
  /** If true, calls stopPropagation on the trigger press event. Default: true. */
  stopPropagation?: boolean;
}

// ── Component ────────────────────────────────

/**
 * A reusable context menu ("..." button → bottom sheet).
 *
 * Renders a trigger button (MoreVertical by default). On press, opens a
 * bottom sheet with the given menu items. Supports both uncontrolled and
 * controlled modes.
 *
 * Used by ChannelActionsMenu, TextActionMenu, offline-dictionaries, and
 * any other place that needs a "..." context menu on mobile.
 *
 * @example
 * // Uncontrolled (most common):
 * <ContextMenu items={[{ key: 'copy', icon: Copy, label: 'Copy', onPress: handleCopy }]} />
 *
 * @example
 * // Controlled (when parent manages open state, e.g. for sub-modals):
 * <ContextMenu open={open} onOpenChange={setOpen} items={items} />
 *
 * @example
 * // Custom trigger:
 * <ContextMenu
 *   items={items}
 *   triggerIcon={Trash2}
 *   triggerSize={20}
 *   triggerClassName="rounded-lg p-2"
 * />
 */
export function ContextMenu({
  items,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  triggerIcon: TriggerIcon = MoreVertical,
  triggerSize = 14,
  triggerColor = ICON_MUTED,
  triggerClassName,
  triggerHitSlop = 6,
  stopPropagation = true,
}: ContextMenuProps) {
  // ── Internal state (uncontrolled mode) ──
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) {
        controlledOnOpenChange?.(next);
      } else {
        setInternalOpen(next);
      }
    },
    [isControlled, controlledOnOpenChange],
  );

  const openMenu = useCallback(
    (e: any) => {
      if (stopPropagation) {
        e.stopPropagation?.();
        e.preventDefault?.();
      }
      setOpen(true);
    },
    [stopPropagation, setOpen],
  );

  const closeMenu = useCallback(() => setOpen(false), [setOpen]);

  const handleItemPress = useCallback(
    (item: ContextMenuItem) => {
      if (item.loading || item.disabled) return;
      item.onPress();
      setOpen(false);
    },
    [setOpen],
  );

  // ── Render ──

  return (
    <>
      {/* Trigger button */}
      <Pressable
        onPress={openMenu}
        className={triggerClassName ?? 'h-7 w-7 items-center justify-center rounded-md active:bg-muted'}
        hitSlop={triggerHitSlop}
      >
        <TriggerIcon size={triggerSize} color={triggerColor} />
      </Pressable>

      {/* Bottom sheet menu */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={closeMenu}
        >
          <Pressable
            onPress={() => {}}
            className="rounded-t-2xl bg-card px-4 pb-8 pt-2"
          >
            {/* Handle bar */}
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>

            {/* Menu items */}
            {items.map((item) => {
              const iconColor = item.destructive ? ICON_DESTRUCTIVE : ICON_PRIMARY;

              return (
                <Pressable
                  key={item.key}
                  onPress={() => handleItemPress(item)}
                  disabled={item.loading || item.disabled}
                  className="flex-row items-center gap-3 rounded-lg px-4 py-3.5 active:bg-muted"
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                    {item.loading ? (
                      <ActivityIndicator size="small" color={ICON_MUTED} />
                    ) : item.icon ? (
                      <item.icon size={16} color={iconColor} />
                    ) : null}
                  </View>
                  <Text
                    className={`text-base ${item.destructive ? 'text-destructive' : 'text-foreground'} ${item.disabled ? 'opacity-40' : ''}`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
