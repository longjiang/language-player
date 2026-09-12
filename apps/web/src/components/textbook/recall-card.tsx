'use client';

import React, { useEffect, useState } from 'react';
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
 * Blank until loaded rather than showing placeholder text, because "you have not
 * written this yet" and "still loading" need to look different.
 */
export function RecallCard({ stimulus }: { stimulus: RecallStimulus }) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    setValues(loadPersistedTask(stimulus.taskId)?.responses ?? {});
  }, [stimulus.taskId]);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {stimulus.title && (
        <h3 className="text-sm font-medium text-foreground">{stimulus.title}</h3>
      )}
      {values === null ? (
        <p className="text-sm text-muted-foreground">{t('msg.loading')}</p>
      ) : (
        <dl className="flex flex-col gap-2">
          {stimulus.items.map((item) => {
            const value = (values[item.blankId] ?? '').trim();
            return (
              <div key={item.blankId} className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-muted-foreground">{item.title}</dt>
                <dd className="whitespace-pre-wrap text-sm text-foreground">
                  {value || (
                    <span className="text-muted-foreground">{t('label.none')}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
