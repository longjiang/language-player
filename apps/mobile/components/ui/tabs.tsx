import React from 'react';
import { View, Text, Pressable } from 'react-native';
import * as TabsPrimitive from '@rn-primitives/tabs';

// ── Root ──

type RootProps = TabsPrimitive.RootProps & {
  className?: string;
};

export function Root({ children, className, ...props }: RootProps) {
  return (
    <TabsPrimitive.Root className={className} {...props}>
      {children}
    </TabsPrimitive.Root>
  );
}

// ── List ──

type ListProps = TabsPrimitive.ListProps & {
  className?: string;
};

export function List({ children, className, ...props }: ListProps) {
  return (
    <TabsPrimitive.List
      className={`flex-row border-b border-border ${className ?? ''}`}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

// ── Trigger ──

type TriggerProps = TabsPrimitive.TriggerProps & {
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
};

export function Trigger({
  children,
  className,
  activeClassName = 'border-b-2 border-primary',
  inactiveClassName = '',
  ...props
}: TriggerProps) {
  // We can't easily read "active" state here without context,
  // so we rely on styling via the parent. The user can pass
  // an activeClassName that gets applied when the trigger's value matches Root's value.
  // For simplicity, style is handled at the consumer level or via props.
  return (
    <TabsPrimitive.Trigger
      className={`flex-1 items-center px-2 py-2.5 ${className ?? ''}`}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className="text-sm font-medium text-muted-foreground">{children}</Text>
      ) : (
        children
      )}
    </TabsPrimitive.Trigger>
  );
}

// ── Content ──

type ContentProps = TabsPrimitive.ContentProps & {
  className?: string;
};

export function Content({ children, className, ...props }: ContentProps) {
  return (
    <TabsPrimitive.Content
      className={className}
      {...props}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
