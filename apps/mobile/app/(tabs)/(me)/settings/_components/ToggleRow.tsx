import React from 'react';
import { View, Text } from 'react-native';
import * as Switch from '@/components/ui/switch';

type ToggleRowProps = {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
};

export function ToggleRow({ label, desc, value, onValueChange }: ToggleRowProps) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="flex-1 pr-4">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc && <Text className="text-xs text-muted-foreground mt-0.5">{desc}</Text>}
      </View>
      <Switch.Root checked={value} onCheckedChange={onValueChange} />
    </View>
  );
}
