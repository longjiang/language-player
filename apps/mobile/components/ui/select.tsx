import React from 'react';
import { Text } from 'react-native';
import * as SelectPrimitive from '@rn-primitives/select';
import { cn } from '@/lib/utils';

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
// Stock react-native-reusables/shadcn trigger (no customizations other than
// the app's color tokens).

type TriggerProps = SelectPrimitive.TriggerProps & {
  className?: string;
};

export function Trigger({ children, className, ...props }: TriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'border-input dark:bg-input/30 dark:active:bg-input/50 bg-background flex h-10 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 shadow-sm shadow-black/5',
        props.disabled && 'opacity-50',
        className,
      )}
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
      className="text-foreground flex flex-row items-center gap-2 text-sm"
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
      className={cn('bg-black/40', className)}
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
      className={cn('bg-popover border-border relative z-50 min-w-[8rem] rounded-md border p-1 shadow-md shadow-black/5', className)}
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
      className={cn(
        'active:bg-accent relative flex w-full flex-row items-center gap-2 rounded-sm py-2 pl-2 pr-8',
        props.disabled && 'opacity-50',
        className,
      )}
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
    <SelectPrimitive.ItemText className="text-foreground text-sm" {...props} />
  );
}

// ── ItemIndicator ──

type ItemIndicatorProps = SelectPrimitive.ItemIndicatorProps;

export function ItemIndicator({ children, className, ...props }: ItemIndicatorProps) {
  return (
    <SelectPrimitive.ItemIndicator className={className ?? ''} {...props}>
      {children ?? <Text className="text-muted-foreground text-sm">✓</Text>}
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
      className={cn('text-muted-foreground px-2 py-2 text-xs', className)}
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
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}
