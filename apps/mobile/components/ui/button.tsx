import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * App-wide Button — stock react-native-reusables/shadcn defaults (no
 * customizations other than the app's color tokens). One button look
 * everywhere; variants + sizes match the library exactly.
 *
 * Text color is NOT inherited in React Native, so pair the label with
 * `buttonTextClass(variant)`:
 *
 *   <Button variant="default"><Text className={buttonTextClass('default')}>Save</Text></Button>
 */
const buttonVariants = {
  default: 'bg-primary active:bg-primary/90 shadow-sm shadow-black/5',
  destructive: 'bg-destructive active:bg-destructive/90 dark:bg-destructive/60 shadow-sm shadow-black/5',
  outline: 'border border-border bg-background active:bg-accent dark:bg-input/30 dark:border-input dark:active:bg-input/50 shadow-sm shadow-black/5',
  secondary: 'bg-secondary active:bg-secondary/80 shadow-sm shadow-black/5',
  ghost: 'active:bg-accent dark:active:bg-accent/50',
  link: '',
} as const;

const buttonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 gap-1.5 rounded-md px-3',
  lg: 'h-11 rounded-md px-6',
  icon: 'h-10 w-10',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

/** Label classes per variant (stock: text-sm font-medium + variant color) —
 *  pair with `<Button>` labels. */
const buttonTextClasses = {
  default: 'text-sm font-medium text-primary-foreground',
  destructive: 'text-sm font-medium text-destructive-foreground',
  outline: 'text-sm font-medium text-foreground',
  secondary: 'text-sm font-medium text-secondary-foreground',
  ghost: 'text-sm font-medium text-foreground',
  link: 'text-sm font-medium text-primary',
} as const;

export function buttonTextClass(variant: ButtonVariant = 'default'): string {
  return buttonTextClasses[variant];
}

export interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <Pressable
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-md',
        props.disabled && 'opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}
