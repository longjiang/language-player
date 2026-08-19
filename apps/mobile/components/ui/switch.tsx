import React from 'react';
import * as SwitchPrimitive from '@rn-primitives/switch';
import { cn } from '@/lib/utils';

// ── Root ──
// Stock react-native-reusables/shadcn switch (no customizations other than
// the app's color tokens): small (w-8 / h-[1.15rem]), bg-primary when
// checked, bg-input when off.

type RootProps = SwitchPrimitive.RootProps & {
  className?: string;
};

export function Root({ className, ...props }: RootProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'flex h-[1.15rem] w-8 shrink-0 flex-row items-center rounded-full border border-transparent shadow-sm shadow-black/5',
        props.checked ? 'bg-primary' : 'bg-input dark:bg-input/80',
        props.disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'bg-background size-4 rounded-full',
          props.checked ? 'dark:bg-primary-foreground translate-x-3.5' : 'dark:bg-foreground translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
