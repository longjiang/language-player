import React from 'react';
import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * App-wide Card — stock react-native-reusables/shadcn defaults (no
 * customizations other than the app's color tokens): bg-card, border,
 * rounded-xl, py-6. Content/header/footer carry the horizontal padding
 * (px-6), exactly like the library.
 */
export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('bg-card border-border flex flex-col gap-6 rounded-xl border py-6 shadow-sm shadow-black/5', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('flex flex-col gap-1.5 px-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps) {
  return <Text className={cn('text-card-foreground font-semibold leading-none', className)} {...props} />;
}

export function CardDescription({ className, ...props }: TextProps) {
  return <Text className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn('flex flex-row items-center px-6', className)} {...props} />;
}
