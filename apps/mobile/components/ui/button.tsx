import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * App-wide Button (react-native-reusables pattern, adapted to this app's
 * semantic tokens and spacing scale). One button look everywhere: variant +
 * size classes replace the ad-hoc `rounded-lg bg-primary px-4 py-2 …`
 * containers that used to differ between screens.
 *
 * Text color is NOT inherited in React Native, so pair the label with
 * `buttonTextClass(variant)`:
 *
 *   <Button variant="default"><Text className={buttonTextClass('default')}>Save</Text></Button>
 */
const buttonVariants = {
  default: 'bg-primary active:bg-primary/90',
  destructive: 'bg-destructive active:bg-destructive/90',
  outline: 'border border-border bg-background active:bg-muted',
  secondary: 'bg-secondary active:bg-secondary/80',
  ghost: 'active:bg-muted',
  link: 'active:opacity-70',
} as const;

const buttonSizes = {
  default: 'h-11 rounded-lg px-4',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-12 rounded-lg px-6',
  icon: 'h-10 w-10 rounded-lg',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

/** Text color class per variant — pair with `<Button>` labels. */
const buttonTextClasses = {
  default: 'text-primary-foreground',
  destructive: 'text-destructive-foreground',
  outline: 'text-foreground',
  secondary: 'text-secondary-foreground',
  ghost: 'text-foreground',
  link: 'text-primary',
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
        'flex-row items-center justify-center gap-2',
        props.disabled && 'opacity-40',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}
