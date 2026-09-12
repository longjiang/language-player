import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { DataTableStimulus } from '@langplayer/textbooks';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { InlineTrackButton } from './InlineTrackButton';

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
 *
 * A row that carries `audio` renders its play control in the first cell, beside the
 * row's label — which is where the recording is heard and answered (A ➌).
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
                  <View className="flex-row items-center gap-2">
                    {c === 0 && <InlineTrackButton tracks={row.audio} />}
                    {/* The row's glyph, if it has one: decoration beside the text rather than
                        text itself, so the cell stays pure vocabulary the student can tap. */}
                    {c === 0 && row.icon ? (
                      <Text aria-hidden className="shrink-0 text-base">
                        {row.icon}
                      </Text>
                    ) : null}
                    {row.cells[c] ? (
                      // A ➌'s blanks answer from picture sets and the workbook prints them as
                      // small letter blanks, so the cell variant is what belongs in a cell.
                      <TokenizedText
                        text={row.cells[c]!}
                        l2Code={l2Lang.code}
                        blankVariant="cell"
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))}
      </View>
    </ScrollView>
  );
}
