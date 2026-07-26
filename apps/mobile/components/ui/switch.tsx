import React from 'react';
import { View } from 'react-native';
import * as SwitchPrimitive from '@rn-primitives/switch';

// ── Root ──

type RootProps = SwitchPrimitive.RootProps & {
  className?: string;
};

export function Root({ className, ...props }: RootProps) {
  return (
    <SwitchPrimitive.Root
      className={`h-6 w-11 flex-row items-center rounded-full bg-muted data-[checked=true]:bg-primary ${className ?? ''}`}
      {...props}
    >
      <SwitchPrimitive.Thumb className="h-5 w-5 rounded-full bg-background shadow-sm ml-0.5 data-[checked=true]:ml-[22px]" />
    </SwitchPrimitive.Root>
  );
}
