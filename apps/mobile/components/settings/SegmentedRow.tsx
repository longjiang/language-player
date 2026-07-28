import React from 'react';
import { View, Text, Pressable } from 'react-native';

type SegmentedRowProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel: (v: T) => string;
};

export function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
}: SegmentedRowProps<T>) {
  return (
    <View className="flex-row rounded-lg border border-border bg-muted p-0.5">
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          className={`flex-1 py-2 items-center rounded-md ${value === opt ? 'bg-card' : ''}`}
        >
          <Text className={`text-xs font-semibold ${value === opt ? 'text-foreground' : 'text-muted-foreground'}`}>
            {renderLabel(opt)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
