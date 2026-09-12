'use client';

import React from 'react';
import { bankIsPicked, createAssetResolver, pickValues, type Bank } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankPicker } from './blank-picker';

/**
 * The option pool a blank draws from.
 *
 * Two shapes, and which one applies is a property of the **blank**, not of the bank:
 *
 * - **Picked** (`choose` blanks): tapping an option fills the currently selected blank, as
 *   the printed workbook's banks work. The letter or word *is* the answer, so the options
 *   have to be controls.
 * - **A reference list** (`type` blanks): the student writes the answer, so the pool is text
 *   to read rather than a row of buttons — A ➍ prints three words under each summary and the
 *   student types them in. Buttons there would invite picking, which is not the exercise, and
 *   would take the words' taps away from the dictionary, because a token's tap stops at the
 *   token and never reaches the button around it.
 *
 * The words are tokenized in both shapes: they are L2 the student may not know, and looking
 * one up is what the pool is for.
 *
 * **A word the student has used is struck out, whatever `allowReuse` says.** The strike means
 * "you have placed this", which is what a student working down a summary needs to see — and it
 * has to survive reuse: A ➍ (4) uses 摇 twice, so the second use has to still be findable in a
 * pool of three words. `allowReuse` describes the answer key (may this word appear twice?); it
 * does not mean the word has not been used. An option is still tappable when struck.
 *
 * `given` blanks do not count as used: their answers are pre-filled in the store, so counting
 * them would strike out A ➍ (1)'s entire pool — the printed worked example — before the student
 * has done anything.
 */
export function WordBank({ bank }: { bank: Bank }) {
  const t = useT();
  const { l2 } = useLanguage();
  const ctx = useTextbookTask();
  const { selected, pick, responses } = useBlankPicker();
  const resolve = createAssetResolver(ASSET_BASE_URL);

  const picked = ctx ? bankIsPicked(ctx.task, bank.id) : true;
  const usedValues = new Set(
    Object.entries(responses)
      .filter(([id, value]) => value && ctx?.task.blanks?.[id]?.kind !== 'given')
      .map(([, value]) => value),
  );
  // For a multi-select blank the options already picked are shown as chosen rather
  // than consumed, so a second tap unpicks them.
  const chosenValues = new Set(pickValues(selected ? (responses[selected] ?? '') : ''));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {bank.items.map((item) => {
          const chosen = chosenValues.has(item);
          const consumed = !chosen && usedValues.has(item);
          const label = bank.optionLabels?.[item];
          const image = bank.optionImages?.[item];

          // `justify-end`, not the default: a ruby reading enlarges the line box and pushes
          // the base glyph down, so without it a pool shows options whose characters sit at
          // different heights depending on whether their reading has arrived (measured 7px in
          // A ➍, where a reading-less 快 sat above 趟 and 摇). Pinning the content to the
          // bottom puts the shared baseline at a fixed offset and lets the reading grow
          // upward, which is also what makes the chips reserve the reading space for each
          // other — the row stretches every chip to the tallest.
          const skin = `flex flex-col items-center justify-end gap-1 overflow-hidden rounded-md border text-sm ${
            image ? 'w-32 p-0 pb-1.5' : 'px-3 py-1.5'
          } ${
            chosen
              ? 'border-primary bg-primary/10 text-foreground'
              : consumed
                ? 'border-border bg-muted/40 text-muted-foreground line-through'
                : picked
                  ? 'border-border bg-card text-foreground hover:bg-muted'
                  : 'border-border bg-muted/30 text-foreground'
          }`;

          const body = (
            <>
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolve(image)}
                  alt=""
                  className={`h-20 w-full object-cover ${consumed ? 'opacity-40' : ''}`}
                />
              )}
              <span className={image ? 'flex items-baseline gap-1 px-1' : 'flex items-baseline gap-1'}>
                {/* An option answered by a letter prints the letter; a typed pool is only its
                    words, and a bare letter there would be content rather than a marker. */}
                {label && <span className="font-semibold text-primary">{item}</span>}
                <TokenizedText text={label ?? item} l2Code={l2.code} inline />
              </span>
            </>
          );

          // A reference list is not a control: no button, no tap target, so a tap on a word
          // is the dictionary's and nothing else.
          if (!picked) {
            return (
              <div key={item} className={skin}>
                {body}
              </div>
            );
          }

          return (
            <button
              key={item}
              type="button"
              onClick={() => pick(item)}
              aria-pressed={chosen}
              className={skin}
            >
              {body}
            </button>
          );
        })}
      </div>
      {picked && !selected && (
        <p className="text-xs text-muted-foreground">{t('msg.please_select_option')}</p>
      )}
    </div>
  );
}
