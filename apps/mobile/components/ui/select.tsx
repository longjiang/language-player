import React from 'react';
import { View, Text, Pressable } from 'react-native';
import * as SelectPrimitive from '@rn-primitives/select';

// ── Root ──

type RootProps = SelectPrimitive.RootProps & {
  className?: string;
};

export function Root({ children, className, ...props }: RootProps) {
  return (
    <SelectPrimitive.Root {...props}>
      {children}
    </SelectPrimitive.Root>
  );
}

// ── Trigger ──

type TriggerProps = SelectPrimitive.TriggerProps & {
  className?: string;
};

export function Trigger({ children, className, ...props }: TriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={`flex-row items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 ${className ?? ''}`}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  );
}

// ── Value ──

type ValueProps = SelectPrimitive.ValueProps;

export function Value(props: ValueProps) {
  return (
    <SelectPrimitive.Value
      className="text-sm text-foreground"
      {...props}
    />
  );
}

// ── Portal ──

type PortalProps = SelectPrimitive.PortalProps;

export function Portal({ children, ...props }: PortalProps) {
  return <SelectPrimitive.Portal {...props}>{children}</SelectPrimitive.Portal>;
}

// ── Overlay ──

type OverlayProps = SelectPrimitive.OverlayProps;

export function Overlay({ className, ...props }: OverlayProps) {
  return (
    <SelectPrimitive.Overlay
      className={`bg-black/40 ${className ?? ''}`}
      {...props}
    />
  );
}

// ── Content ──

type ContentProps = SelectPrimitive.ContentProps & {
  className?: string;
};

export function Content({ children, className, ...props }: ContentProps) {
  return (
    <SelectPrimitive.Content
      className={`rounded-xl border border-border bg-card p-1 shadow-lg ${className ?? ''}`}
      {...props}
    >
      {children}
    </SelectPrimitive.Content>
  );
}

// ── Item ──

type ItemProps = SelectPrimitive.ItemProps & {
  className?: string;
};

export function Item({ children, className, ...props }: ItemProps) {
  return (
    <SelectPrimitive.Item
      className={`flex-row items-center justify-between rounded-md px-3 py-2 active:bg-muted ${className ?? ''}`}
      {...props}
    >
      {children}
    </SelectPrimitive.Item>
  );
}

// ── ItemText ──

type ItemTextProps = SelectPrimitive.ItemTextProps;

export function ItemText(props: ItemTextProps) {
  return (
    <SelectPrimitive.ItemText className="text-sm text-foreground" {...props} />
  );
}

// ── ItemIndicator ──

type ItemIndicatorProps = SelectPrimitive.ItemIndicatorProps;

export function ItemIndicator({ children, className, ...props }: ItemIndicatorProps) {
  return (
    <SelectPrimitive.ItemIndicator className={className ?? ''} {...props}>
      {children ?? <Text className="text-sm text-primary">✓</Text>}
    </SelectPrimitive.ItemIndicator>
  );
}

// ── Group ──

type GroupProps = SelectPrimitive.GroupProps & {
  className?: string;
};

export function Group({ children, className, ...props }: GroupProps) {
  return (
    <SelectPrimitive.Group className={className ?? ''} {...props}>
      {children}
    </SelectPrimitive.Group>
  );
}

// ── Label ──

type LabelProps = SelectPrimitive.LabelProps & {
  className?: string;
};

export function Label({ children, className, ...props }: LabelProps) {
  return (
    <SelectPrimitive.Label
      className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground ${className ?? ''}`}
      {...props}
    >
      {children}
    </SelectPrimitive.Label>
  );
}

// ── Separator ──

type SeparatorProps = SelectPrimitive.SeparatorProps & {
  className?: string;
};

export function Separator({ className, ...props }: SeparatorProps) {
  return (
    <SelectPrimitive.Separator
      className={`my-1 border-t border-border ${className ?? ''}`}
      {...props}
    />
  );
}
