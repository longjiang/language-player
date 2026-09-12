import React from 'react';
import { Text, View } from 'react-native';
import { indexToCircled } from '@langplayer/textbooks';
import { useTextbookTask } from './task-provider';
import { BlankField } from './BlankField';

/**
 * A numbered row of blanks, printed as `① ___ ② ___ ③ ___`.
 *
 * The picture-set tasks have no passage — the student listens and answers a run
 * of numbered slots — so the blanks need a container of their own. The index is
 * printed because it is how the workbook and the answer key both refer to the
 * question.
 */
export function NumberedBlanks({ ids }: { ids: string[] }) {
  const ctx = useTextbookTask();
  const blanks = ctx?.task.blanks ?? {};

  return (
    <View className="flex-row flex-wrap items-center gap-x-5 gap-y-3">
      {ids.map((id, index) => {
        const blank = blanks[id];
        if (!blank) return null;
        const n = Number(id.replace(/^b/, ''));
        return (
          <View key={id} className="flex-row items-center gap-1.5">
            <Text className="text-sm text-muted-foreground">
              {indexToCircled(Number.isFinite(n) ? n : index + 1)}
            </Text>
            <BlankField blank={blank} />
          </View>
        );
      })}
    </View>
  );
}
