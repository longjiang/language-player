'use client';

import React from 'react';
import type { Bank } from '@langplayer/textbooks';
import { createAssetResolver } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
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
  const resolve = createAssetResolver(ASSET_BASE_URL);

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
              className={`flex flex-col items-center gap-1 overflow-hidden rounded-md border text-sm transition-colors ${
                bank.optionImages?.[item] ? 'w-32 p-0 pb-1.5' : 'px-3 py-1.5'
              } ${
                isPicked
                  ? 'border-primary bg-primary/10 text-foreground'
                  : consumed
                    ? 'border-border bg-muted/40 text-muted-foreground line-through'
                    : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {bank.optionImages?.[item] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolve(bank.optionImages[item]!)}
                  alt=""
                  className={`h-20 w-full object-cover ${consumed ? 'opacity-40' : ''}`}
                />
              )}
              {bank.optionLabels?.[item] ? (
                <span className={bank.optionImages?.[item] ? 'px-1' : ''}>
                  <span className="font-semibold text-primary">{item}</span>
                  <span className="ml-1">{bank.optionLabels[item]}</span>
                </span>
              ) : (
                <span className={bank.optionImages?.[item] ? 'px-1' : ''}>{item}</span>
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
