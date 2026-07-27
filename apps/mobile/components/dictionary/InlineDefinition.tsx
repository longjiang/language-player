import React from 'react';
import { View, Text } from 'react-native';
import type { DictionaryEntry } from '@langplayer/shared';

/**
 * Inline definition row — shows pronunciation + part of speech + first definition
 * from a lazily enriched DictionaryEntry. Renders nothing (minimal placeholder)
 * when no entry data is available yet.
 */
export function InlineDefinition({
  entry,
}: {
  /** Canonical dictionary entry, populated by the lazy enrichment flow. */
  entry?: DictionaryEntry | null;
}) {
  if (!entry) {
    // Render a minimal spacer so rows maintain consistent height
    // even before enrichment completes.
    return <View className="h-3.5" />;
  }

  const pronunciation = entry.pronunciation || '';
  const pos = entry.part_of_speech || '';
  const definition = entry.definitions?.[0] || '';

  if (!pronunciation && !pos && !definition) {
    return <View className="h-0.5" />;
  }

  return (
    <Text className="mt-0.5 text-xs text-muted-foreground/80" numberOfLines={1}>
      {pronunciation ? (
        <Text className="text-muted-foreground/50">{pronunciation} </Text>
      ) : null}
      {pos ? (
        <Text className="italic text-muted-foreground/50">{pos} </Text>
      ) : null}
      {definition ? (
        <Text>{definition}</Text>
      ) : null}
    </Text>
  );
}
