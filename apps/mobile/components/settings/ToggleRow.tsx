import React from 'react';
import { View, Text } from 'react-native';
import * as Switch from '@/components/ui/switch';

type ToggleRowProps = {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** When true, the row appears muted and the toggle is disabled. */
  disabled?: boolean;
};

export function ToggleRow({ label, desc, value, onValueChange, disabled }: ToggleRowProps) {
  return (
    <View className={`flex-row items-center justify-between py-2.5 ${disabled ? 'opacity-40' : ''}`}>
      <View className="flex-1 pr-4">
        <Text className={`text-sm font-medium ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</Text>
        {desc && <Text className={`text-xs mt-0.5 ${disabled ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{desc}</Text>}
      </View>
      <Switch.Root checked={value} onCheckedChange={disabled ? () => {} : onValueChange} />
    </View>
  );
}
