import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { RecallStimulus } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { loadPersistedTask } from './task-provider';

/**
 * Shows what the student wrote in an earlier task (SPEC-095).
 *
 * D ➐ asks them to record themselves reading the draft from ➏, so the draft is shown
 * here. Exercise state is local-only (ADR-0044): this reads the same saved state the
 * store writes, and nothing leaves the device.
 *
 * AsyncStorage is asynchronous, so this loads in an effect and distinguishes "not
 * written yet" from "still loading".
 */
export function RecallCard({ stimulus }: { stimulus: RecallStimulus }) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPersistedTask(stimulus.taskId).then((state) => {
      if (!cancelled) setValues(state?.responses ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [stimulus.taskId]);

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-3">
      {stimulus.title ? (
        <Text className="text-sm font-medium text-foreground">{stimulus.title}</Text>
      ) : null}
      {values === null ? (
        <Text className="text-sm text-muted-foreground">{t('msg.loading')}</Text>
      ) : (
        stimulus.items.map((item) => {
          const value = (values[item.blankId] ?? '').trim();
          return (
            <View key={item.blankId} className="gap-0.5">
              <Text className="text-xs font-medium text-muted-foreground">{item.title}</Text>
              <Text className="text-sm text-foreground">
                {value || <Text className="text-muted-foreground">{t('label.none')}</Text>}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}
