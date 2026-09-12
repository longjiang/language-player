'use client';

import React, { useMemo } from 'react';
import { createAssetResolver, pictureSetsIn, type BlankSpec } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankPicker } from './blank-picker';
import { useBlankChoice } from './blank-choice';

/**
 * An in-passage illustration slot (SPEC-095).
 *
 * B ➎ / ➏ ask the student to place one of a set of illustrations into the article, and
 * the booklet prints a box where the picture goes. A `choose` blank answering from a
 * `pictureSet` renders as this instead of a letter chip: the box shows the illustration
 * once picked, so the article reads as the finished page rather than as a row of letters.
 *
 * Tapping the box opens the task's picture-choice dialog and picking a picture fills
 * it, exactly as a compact `cell` blank does — the same blank kind answered the same
 * way, in the two shapes the workbook prints it. This stays a rendering variant of
 * `BlankField` rather than a stimulus kind of its own.
 */
export function InlineImageSlot({ blank, value }: { blank: BlankSpec; value: string }) {
  const t = useT();
  const ctx = useTextbookTask();
  const { selected } = useBlankPicker();
  const choice = useBlankChoice();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);

  const set = blank.optionSet ? pictureSetsIn(ctx!.task).get(blank.optionSet) : undefined;
  const item = set?.items.find((i) => i.letter === value);
  const isSelected = selected === blank.id;

  return (
    <span className="mx-1 inline-flex align-middle">
      <button
        type="button"
        onClick={() => {
          // Opening the choices also selects the blank, which is what arms the picture
          // bank below the task; the dialog itself is where a pick is made and where an
          // answer is taken back.
          choice?.open(blank.id);
        }}
        // When filled, the picture's own label names it — that is content, not chrome.
        aria-label={item ? item.label : t('label.pick_illustration')}
        aria-pressed={isSelected}
        className={`flex h-24 w-32 flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-muted/30 transition-colors ${
          isSelected ? 'border-primary' : 'border-border hover:border-muted-foreground/60'
        }`}
      >
        {item ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolve(item.image!)}
              alt={item.label}
              className="h-20 w-full object-cover"
            />
            <span className="w-full truncate px-1 text-center text-[10px] text-muted-foreground">
              {item.label}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-[10px] text-muted-foreground">
            <span aria-hidden className="text-lg leading-none">
              🖼
            </span>
            {t('label.pick_illustration')}
          </span>
        )}
      </button>
    </span>
  );
}
