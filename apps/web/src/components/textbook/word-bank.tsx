'use client';

import React from 'react';
import type { Bank } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useBlankPicker } from './blank-picker';

/**
 * The option pool a `choose` blank draws from.
 *
 * Tapping an option fills the currently selected blank; tapping a blank in the
 * passage selects it. This mirrors the printed workbook, where the bank is
 * printed once and the blanks are numbered.
 *
 * When `allowReuse` is false, options already used elsewhere are dimmed. That is
 * a per-bank flag rather than a global rule: the B ➊ key genuinely reuses the
 * letter `a`, so it is data, not an assumption.
 */
export function WordBank({ bank }: { bank: Bank }) {
  const t = useT();
  const { selected, pick, responses } = useBlankPicker();

  const usedValues = new Set(Object.values(responses).filter(Boolean));
  // For a multi-select blank the options already picked are shown as chosen rather
  // than consumed, so a second tap unpicks them.
  const picked = new Set(
    (selected ? (responses[selected] ?? '') : '')
      .split(/[、,，]/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {bank.items.map((item) => {
          const isPicked = picked.has(item);
          const consumed = !isPicked && !bank.allowReuse && usedValues.has(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => pick(item)}
              aria-pressed={isPicked}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                isPicked
                  ? 'border-primary bg-primary/10 text-foreground'
                  : consumed
                    ? 'border-border bg-muted/40 text-muted-foreground line-through'
                    : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {bank.optionLabels?.[item] ? (
                <span>
                  <span className="mr-1.5 font-semibold text-primary">{item}</span>
                  {bank.optionLabels[item]}
                </span>
              ) : (
                item
              )}
            </button>
          );
        })}
      </div>
      {!selected && (
        <p className="text-xs text-muted-foreground">{t('msg.please_select_option')}</p>
      )}
    </div>
  );
}
