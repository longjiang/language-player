import React from 'react';
import { View, Text } from 'react-native';
import Slider from '@react-native-community/slider';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

type SliderRowProps = {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  valueDisplay?: string;
  leftLabel?: string;
  rightLabel?: string;
  centerLabel?: string;
};

export function SliderRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  valueDisplay,
  leftLabel,
  rightLabel,
  centerLabel,
}: SliderRowProps) {
  return (
    <View className="py-2.5">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-lg font-semibold text-foreground tabular-nums">
          {valueDisplay ?? value}
        </Text>
      </View>
      {desc ? <Text className="text-xs text-muted-foreground mb-2">{desc}</Text> : null}
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={ICON_PRIMARY}
        maximumTrackTintColor={ICON_MUTED}
        thumbTintColor={ICON_PRIMARY}
      />
      <View className="flex-row justify-between -mt-1">
        <Text className="text-xs text-muted-foreground">{leftLabel ?? String(min)}</Text>
        {centerLabel ? (
          <Text className="text-xs text-muted-foreground">{centerLabel}</Text>
        ) : null}
        <Text className="text-xs text-muted-foreground">{rightLabel ?? String(max)}</Text>
      </View>
    </View>
  );
}
