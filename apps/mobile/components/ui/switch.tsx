import React from 'react';
import { View } from 'react-native';
import * as SwitchPrimitive from '@rn-primitives/switch';
import { useColorScheme } from 'nativewind';

// ── Root ──

type RootProps = SwitchPrimitive.RootProps & {
  className?: string;
};

export function Root({ className, ...props }: RootProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bgColor = props.checked
    ? isDark ? 'hsl(228, 74%, 65%)' : 'hsl(228, 74%, 59%)'
    : isDark ? 'hsl(230, 20%, 18%)' : 'hsl(210, 17%, 94%)';

  return (
    <SwitchPrimitive.Root
      className={`h-6 w-11 flex-row items-center rounded-full ${className ?? ''}`}
      style={{ backgroundColor: bgColor }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="h-5 w-5 rounded-full bg-background shadow-sm"
        style={{ marginLeft: props.checked ? 22 : 2 }}
      />
    </SwitchPrimitive.Root>
  );
}
