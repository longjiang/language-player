import React from 'react';
import { View, Text } from 'react-native';

interface ErrorNoticeProps {
  /** Already-localized message to show. */
  message: string;
  className?: string;
}

/**
 * Consistent error presentation across dictionary, popup, and content panels.
 * Semantic tokens only — no hardcoded colors.
 */
export function ErrorNotice({ message, className = '' }: ErrorNoticeProps) {
  if (!message) return null;
  return (
    <View className={`rounded-lg border border-destructive/30 bg-destructive/10 p-3 ${className}`}>
      <Text className="text-sm text-destructive">{message}</Text>
    </View>
  );
}
