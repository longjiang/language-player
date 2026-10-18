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
export function InlineImageSlot({
  blank,
  value,
  layout = 'inline',
}: {
  blank: BlankSpec;
  value: string;
  /**
   * Where the box is printed. `inline` is the box inside running text; `gutter` is the
   * column a passage puts beside itself on a wide screen (B ➎), where the box widens to
   * its column and the picture is shown whole instead of cropped into a fixed 128×80.
   */
  layout?: 'inline' | 'gutter';
}) {
  const t = useT();
  const ctx = useTextbookTask();
  const { selected } = useBlankPicker();
  const choice = useBlankChoice();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);

  const set = blank.optionSet ? pictureSetsIn(ctx!.task).get(blank.optionSet) : undefined;
  const item = set?.items.find((i) => i.letter === value);
  const isSelected = selected === blank.id;
  const gutter = layout === 'gutter';

  return (
    // A gutter slot fills its column; an inline one keeps its printed size in the text.
    <span className={gutter ? 'block' : 'mx-1 inline-flex align-middle'}>
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
        className={`flex flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-muted/30 transition-colors ${
          gutter ? 'min-h-24 w-32 md:w-full' : 'h-24 w-32'
        } ${isSelected ? 'border-primary' : 'border-border hover:border-muted-foreground/60'}`}
      >
        {item ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolve(item.image!)}
              alt={item.label}
              // Uncropped in the gutter: these are 900×487 workbook screenshots, and
              // `object-cover` in a fixed 128×96 box cut off about 40% of the picture.
              className={gutter ? 'w-full' : 'h-20 w-full object-cover'}
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
