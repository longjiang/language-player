import React from 'react';
import { View, Text, Pressable } from 'react-native';
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

// ── Portal ──

type PortalProps = DialogPrimitive.PortalProps;

export function Portal({ children, ...props }: PortalProps) {
  return <DialogPrimitive.Portal {...props}>{children}</DialogPrimitive.Portal>;
}

// ── Overlay ──

type OverlayProps = DialogPrimitive.OverlayProps;

export function Overlay({ className, ...props }: OverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={`absolute inset-0 bg-black/40 ${className ?? ''}`}
      {...props}
    />
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

// ── Sheet Content (bottom sheet style, full-width) ──

type SheetContentProps = DialogPrimitive.ContentProps & {
  className?: string;
};

export function SheetContent({ children, className, ...props }: SheetContentProps) {
  return (
    <View className="absolute bottom-0 left-0 right-0">
      <DialogPrimitive.Content
        className={`rounded-t-xl border-t border-border bg-background px-4 pb-8 pt-4 max-h-[75%] ${className ?? ''}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </View>
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
