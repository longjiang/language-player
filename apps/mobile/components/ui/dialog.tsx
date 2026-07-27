import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import * as DialogPrimitive from '@rn-primitives/dialog';

// ── Root ──

type RootProps = DialogPrimitive.RootProps;

export function Root({ children, ...props }: RootProps) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}

// ── Trigger ──

type TriggerProps = DialogPrimitive.TriggerProps;

export function Trigger({ children, className, ...props }: TriggerProps) {
  return (
    <DialogPrimitive.Trigger className={className} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
}

// ── Portal (always includes an overlay unless opt-out) ──

type PortalProps = DialogPrimitive.PortalProps & {
  /** Set to false if the dialog provides its own overlay. */
  overlay?: boolean;
};

export function Portal({ children, overlay = true, ...props }: PortalProps) {
  return (
    <DialogPrimitive.Portal {...props}>
      {overlay && <Overlay closeOnPress />}
      {children}
    </DialogPrimitive.Portal>
  );
}

// ── Overlay (fade in on mount, or bidirectional when `open` is provided) ──

type OverlayProps = DialogPrimitive.OverlayProps & {
  /** When provided (forceMount scenarios), animates opacity in both directions. */
  open?: boolean;
};

export function Overlay({ className, open, ...props }: OverlayProps) {
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const isControlled = open !== undefined;

  useEffect(() => {
    if (!isControlled) {
      // Mount-only: fade in once
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isControlled, opacity]);

  useEffect(() => {
    if (isControlled) {
      Animated.timing(opacity, {
        toValue: open ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [open, isControlled, opacity]);

  return (
    <Animated.View
      pointerEvents={isControlled ? (open ? 'auto' : 'none') : 'box-none'}
      className="absolute inset-0"
      style={{ opacity }}
    >
      <DialogPrimitive.Overlay
        className={`absolute inset-0 bg-black/40 ${className ?? ''}`}
        {...props}
      />
    </Animated.View>
  );
}

// ── Content (centered popover style) ──

type ContentProps = DialogPrimitive.ContentProps & {
  className?: string;
};

export function Content({ children, className, ...props }: ContentProps) {
  return (
    <View className="absolute inset-0 flex items-center justify-center">
      <DialogPrimitive.Content
        className={`w-[90%] max-w-md rounded-xl bg-card p-4 border border-border shadow-lg ${className ?? ''}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </View>
  );
}

// ── Sheet Content (bottom sheet style, full-width, slides up on mount) ──

type SheetContentProps = DialogPrimitive.ContentProps & {
  className?: string;
};

export function SheetContent({ children, className, ...props }: SheetContentProps) {
  const translateY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity]);

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0"
      style={{ transform: [{ translateY }], opacity }}
    >
      <DialogPrimitive.Content
        className={`rounded-t-xl border-t border-border bg-background px-4 pb-8 pt-4 max-h-[75%] ${className ?? ''}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </Animated.View>
  );
}

// ── Drawer Content (slides in from the right, positioned below a top offset) ──

type DrawerContentProps = DialogPrimitive.ContentProps & {
  className?: string;
  /** Distance from the top of the screen (e.g., below the header bar). Default 0. */
  topOffset?: number;
  /** When provided (forceMount scenarios), animates slide in both directions. */
  open?: boolean;
  /** Drawer width. Default 256. */
  drawerWidth?: number;
};

export function DrawerContent({ children, className, topOffset = 0, open, drawerWidth = 256, ...props }: DrawerContentProps) {
  const translateX = useRef(new Animated.Value(open ? 0 : 300)).current;
  const isControlled = open !== undefined;

  useEffect(() => {
    if (!isControlled) {
      // Mount-only: slide in once
      Animated.timing(translateX, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isControlled, translateX]);

  useEffect(() => {
    if (isControlled) {
      Animated.timing(translateX, {
        toValue: open ? 0 : 300,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [open, isControlled, translateX]);

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute right-0"
      style={{
        top: topOffset,
        bottom: 0,
        width: drawerWidth,
        transform: [{ translateX }],
      }}
    >
      <DialogPrimitive.Content
        className={`border-l border-border bg-background p-4 shadow-lg ${className ?? ''}`}
        style={{ width: drawerWidth }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </Animated.View>
  );
}

// ── Close ──

type CloseProps = DialogPrimitive.CloseProps;

export function Close({ children, className, ...props }: CloseProps) {
  return (
    <DialogPrimitive.Close className={className} {...props}>
      {children}
    </DialogPrimitive.Close>
  );
}

// ── Title ──

type TitleProps = DialogPrimitive.TitleProps;

export function Title({ children, className, ...props }: TitleProps) {
  return (
    <DialogPrimitive.Title className={`text-lg font-bold text-foreground ${className ?? ''}`} {...props}>
      {children}
    </DialogPrimitive.Title>
  );
}

// ── Description ──

type DescriptionProps = DialogPrimitive.DescriptionProps;

export function Description({ children, className, ...props }: DescriptionProps) {
  return (
    <DialogPrimitive.Description className={`text-sm text-muted-foreground ${className ?? ''}`} {...props}>
      {children}
    </DialogPrimitive.Description>
  );
}
