import React from 'react';
import { View } from 'react-native';

/**
 * Loading placeholder for a dictionary entry card — shown in the popup
 * dictionary while entries or phrase cards are being fetched, instead of a
 * spinner, so the popup's shape stays stable while it loads. Mirrors the
 * compact DictionaryEntryCard's layout: head line, pronunciation, definition
 * bars, source + save slots.
 */
export function DictionaryEntryCardSkeleton() {
  return (
    <View className="rounded-xl border border-border bg-card px-4 pt-4 pb-3">
      <View className="flex-row items-start gap-2">
        <View className="h-5 w-24 rounded bg-muted" />
        <View className="h-3 w-14 rounded bg-muted" />
        <View className="ml-auto h-4 w-10 rounded bg-muted" />
      </View>
      <View className="mt-3 gap-2">
        <View className="h-3 w-full rounded bg-muted" />
        <View className="h-3 w-4/5 rounded bg-muted" />
        <View className="h-3 w-2/3 rounded bg-muted" />
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <View className="h-3 w-16 rounded bg-muted" />
        <View className="h-6 w-20 rounded-md bg-muted" />
      </View>
    </View>
  );
}
