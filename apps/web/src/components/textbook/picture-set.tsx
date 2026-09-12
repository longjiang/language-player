'use client';

import React from 'react';
import { type PictureSetStimulus } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useBlankPicker } from './blank-picker';
import { PictureOptionTile } from './picture-option-tile';

/**
 * A lettered grid of pictures that blanks reference by letter.
 *
 * This is the bank: it shows what the letters mean, and tapping a picture fills the
 * blank currently selected — the same interaction as the word bank, which is why both
 * share `useBlankPicker`. The bank is *not* the only way to answer: a blank opens the
 * same choices in a dialog at the blank itself (`blank-choice.tsx`), which is how a
 * student answers on a map pin without scrolling down to here.
 */
export function PictureSet({ set }: { set: PictureSetStimulus }) {
  const t = useT();
  const { selected, pick, responses } = useBlankPicker();

  const usedLetters = new Set(Object.values(responses).filter(Boolean));

  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {set.items.map((item) => (
          <li key={item.letter}>
            <PictureOptionTile
              item={item}
              selected={usedLetters.has(item.letter)}
              disabled={!selected}
              onPick={pick}
            />
          </li>
        ))}
      </ul>
      {!selected && <p className="text-xs text-muted-foreground">{t('msg.please_select_option')}</p>}
    </div>
  );
}
