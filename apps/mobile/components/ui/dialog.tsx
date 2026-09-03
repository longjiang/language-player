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

export function Overlay({ className, open, forceMount, ...props }: OverlayProps) {
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const isControlled = open !== undefined;
  // When open is provided (bidirectional mode), the inner primitive needs
  // forceMount to stay mounted during the exit animation.
  const effectiveForceMount = forceMount ?? (isControlled ? true : undefined);

  useEffect(() => {
    const toValue = isControlled ? (open ? 1 : 0) : 1;
    Animated.timing(opacity, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [open, isControlled, opacity]);

  return (
    <Animated.View
      pointerEvents={isControlled ? (open ? 'auto' : 'none') : 'box-none'}
      className="absolute inset-0"
      style={{ opacity }}
    >
      <DialogPrimitive.Overlay
        forceMount={effectiveForceMount}
        className={className ? `absolute inset-0 ${className}` : 'absolute inset-0 bg-black/40'}
        {...props}
      />
    </Animated.View>
  );
}

// ── Content (centered popover style) ──

type ContentProps = DialogPrimitive.ContentProps & {
  className?: string;
};

/**
 * The primitive's Content claims the JS responder on every touch start
 * (`onStartShouldSetResponder: () => true`). A ScrollView inside the dialog
 * never contests it (its own start handler returns false by default), and an
 * ancestor that IS the JS responder makes the native scroll view bar its pan
 * recognizer (RCTScrollViewComponentView `touchesShouldCancelInContentView`) —
 * so nothing inside the dialog can scroll. Default the handler to false so
 * touch passes through to the scrollable content; callers may still override
 * it via props.
 */
export function Content({ children, className, onStartShouldSetResponder, ...props }: ContentProps) {
  return (
    <View className="absolute inset-0 flex items-center justify-center">
      <DialogPrimitive.Content
        className={`bg-background border-border z-50 w-full max-w-md flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 ${className ?? ''}`}
        onStartShouldSetResponder={onStartShouldSetResponder ?? (() => false)}
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

export function SheetContent({
  children,
  className,
  onStartShouldSetResponder,
  ...props
}: SheetContentProps) {
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
      // Anchored to BOTH edges of the portal container (which is the
      // full-screen root PortalHost): the sheet gets a definite height to
      // resolve max-h-[…] against, so it grows from and hugs the true bottom
      // (a content-height wrapper left it floating mid-screen).
      className="absolute bottom-0 left-0 right-0 top-0"
      style={{ transform: [{ translateY }], opacity }}
    >
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <DialogPrimitive.Content
          className={`rounded-t-xl border-t border-border bg-background px-4 pb-8 pt-4 max-h-[75%] ${className ?? ''}`}
          // Same scroll fix as Content (see above): the sheet must never
          // claim the JS responder away from its ScrollView.
          onStartShouldSetResponder={onStartShouldSetResponder ?? (() => false)}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </View>
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

export function DrawerContent({ children, className, topOffset = 0, open, drawerWidth = 256, forceMount, ...props }: DrawerContentProps) {
  const translateX = useRef(new Animated.Value(open ? 0 : drawerWidth + 44)).current;
  const isControlled = open !== undefined;
  // When open is provided (bidirectional mode), the inner primitive needs
  // forceMount to stay mounted during the exit animation.
  const effectiveForceMount = forceMount ?? (isControlled ? true : undefined);

  useEffect(() => {
    const toValue = isControlled ? (open ? 0 : drawerWidth + 44) : 0;
    Animated.timing(translateX, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [open, isControlled, translateX, drawerWidth]);

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
        forceMount={effectiveForceMount}
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
    <DialogPrimitive.Title className={`text-foreground text-base font-semibold leading-none ${className ?? ''}`} {...props}>
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
