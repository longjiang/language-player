'use client';

import React, { useMemo } from 'react';
import { createAssetResolver, pictureSetsIn, type BlankSpec, type PictureOption } from '@langplayer/textbooks';
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
  readOnly = false,
  item: itemOverride,
}: {
  blank: BlankSpec;
  value: string;
  /**
   * Where the box is printed. `inline` is the box inside running text; `gutter` is the
   * column a passage puts beside itself on a wide screen (B ➎), where the box widens to
   * its column and the picture is shown whole instead of cropped into a fixed 128×80.
   */
  layout?: 'inline' | 'gutter';
  /**
   * A carried slot (B ➏) is shown, not answered: no dialog, no pressed state, and an
   * empty box when the earlier task has no pick — never a prompt this task cannot fill.
   */
  readOnly?: boolean;
  /** The picture to print, when it is not resolved from this task's own picture set. */
  item?: PictureOption;
}) {
  const t = useT();
  const ctx = useTextbookTask();
  const { selected } = useBlankPicker();
  const choice = useBlankChoice();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);

  const set = blank.optionSet ? pictureSetsIn(ctx!.task).get(blank.optionSet) : undefined;
  const item = itemOverride ?? set?.items.find((i) => i.letter === value);
  const isSelected = selected === blank.id;
  const gutter = layout === 'gutter';
  const box = `flex flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-muted/30 ${
    gutter ? 'min-h-24 w-32 md:w-full' : 'h-24 w-32'
  }`;

  const picture = item ? (
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
  ) : null;

  const wrapper = gutter ? 'block' : 'mx-1 inline-flex align-middle';

  // A carried picture is display-only: the student answered it in the earlier task, so
  // tapping it must not arm this task's bank or open its dialog.
  if (readOnly) {
    return (
      <span className={wrapper}>
        {item ? (
          <span role="img" aria-label={item.label} className={`${box} border-border`}>
            {picture}
          </span>
        ) : (
          <span aria-hidden className={`${box} border-border`} />
        )}
      </span>
    );
  }

  return (
    // A gutter slot fills its column; an inline one keeps its printed size in the text.
    <span className={wrapper}>
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
        className={`${box} transition-colors ${
          isSelected ? 'border-primary' : 'border-border hover:border-muted-foreground/60'
        }`}
      >
        {item ? (
          picture
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
