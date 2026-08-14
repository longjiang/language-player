import React from 'react';
import { View } from 'react-native';
import * as SwitchPrimitive from '@rn-primitives/switch';
import { useColorScheme } from 'nativewind';
import { darkSemantic, hslToHex, lightSemantic } from '@langplayer/shared';

// ── Root ──

type RootProps = SwitchPrimitive.RootProps & {
  className?: string;
};

export function Root({ className, ...props }: RootProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bgColor = props.checked
    ? hslToHex(isDark ? darkSemantic.primary : lightSemantic.primary)
    : hslToHex(isDark ? darkSemantic.muted : lightSemantic.muted);

  return (
    <SwitchPrimitive.Root
      className={`h-6 w-11 flex-row items-center rounded-full ${className ?? ''}`}
      style={{ backgroundColor: bgColor }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="h-5 w-5 rounded-full bg-primary-foreground shadow-sm"
        style={{ marginLeft: props.checked ? 22 : 2 }}
      />
    </SwitchPrimitive.Root>
  );
}
