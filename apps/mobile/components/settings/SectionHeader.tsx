import React from 'react';
import { Text } from 'react-native';

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
      {title}
    </Text>
  );
}
