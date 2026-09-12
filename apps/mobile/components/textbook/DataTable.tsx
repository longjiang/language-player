import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { DataTableStimulus } from '@langplayer/textbooks';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Tabular stimulus.
 *
 * Cells render through `TokenizedText`, so a cell may carry `{{bN}}` markers and
 * the blanks appear inline in the table — which is how B ➊ puts a blank in the
 * 车型 column and A ➌ puts two per row. The table therefore needs no blank
 * mechanism of its own.
 *
 * Cells are deliberately NOT `inline`: that path renders inside a single RN
 * <Text>, where an interactive blank cannot live and degrades to read-only.
 */
export function DataTable({ table }: { table: DataTableStimulus }) {
  const { l2Lang } = useLanguage();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="rounded-lg border border-border">
        <View className="flex-row bg-muted/40">
          {table.columns.map((column, i) => (
            <View
              key={i}
              className="min-w-[92px] flex-1 border-r border-border px-2 py-2 last:border-r-0"
            >
              <Text className="text-sm font-medium text-foreground">{column}</Text>
            </View>
          ))}
        </View>

        {table.rows.map((row, r) => (
          <View key={r} className="flex-row border-t border-border">
            {table.columns.map((_, c) => (
              <View
                key={c}
                className="min-w-[92px] flex-1 border-r border-border px-2 py-2 last:border-r-0"
              >
                {row[c] ? <TokenizedText text={row[c]!} l2Code={l2Lang.code} /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
