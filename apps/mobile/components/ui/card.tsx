import React from 'react';
import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * App-wide Card (react-native-reusables pattern, adapted to this app's
 * spacing scale): one consistent `rounded-lg border border-border bg-card`
 * container for grouped content.
 */
export function Card({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-lg border border-border bg-card p-4', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('mb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps) {
  return <Text className={cn('text-base font-bold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: TextProps) {
  return <Text className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={className} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn('mt-3 flex-row items-center', className)} {...props} />;
}
