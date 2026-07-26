import React from 'react';
import { View, Text } from 'react-native';
import { Wifi, WifiOff, Database } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

type Source = 'memory' | 'offline' | 'llm-cache' | 'online';

interface Props {
  source: Source | null;
}

const LABELS: Record<Source, string> = {
  memory: 'cached',
  offline: 'offline',
  'llm-cache': 'AI cached',
  online: 'online',
};

function SourceIcon({ source }: { source: Source }) {
  const size = 10;
  const color = ICON_MUTED;
  switch (source) {
    case 'memory': return <Database size={size} color={color} />;
    case 'offline': return <WifiOff size={size} color={color} />;
    case 'llm-cache': return <Database size={size} color={color} />;
    case 'online': return <Wifi size={size} color={color} />;
  }
}

/**
 * Tiny indicator showing where the current dictionary lookup result
 * came from — memory cache, offline SQLite, LLM cache, or online.
 */
export function LookupSourceIndicator({ source }: Props) {
  if (!source) return null;

  return (
    <View className="flex-row items-center gap-1">
      <SourceIcon source={source} />
      <Text className="text-[10px] text-muted-foreground">{LABELS[source]}</Text>
    </View>
  );
}
