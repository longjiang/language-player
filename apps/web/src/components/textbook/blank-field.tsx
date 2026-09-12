'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { indexToCircled, type BlankSpec } from '@langplayer/textbooks';
import { glyphEms } from '@langplayer/utils';
import { useTextbookTask } from './task-provider';
import { useT } from '@/hooks/use-t';
import { InlineImageSlot } from './inline-image-slot';
import { PictureBlankCell } from './picture-blank-cell';

/** The workbook identifies questions by circled numeral; blanks share that index. */
function blankLabel(blank: BlankSpec): string {
  const n = Number(blank.id.replace(/^b/, ''));
  return Number.isFinite(n) ? indexToCircled(n) : blank.id;
}

/**
 * One interactive blank, rendered inline in the tokenized passage.
 *
 * Rendered as a *sibling* of `TokenSpan` rather than inside a token, so the
 * words on either side stay tappable for the dictionary — a student stuck on a
 * blank can look up the word beside it without losing their answer.
 *
 * All state comes from per-blank subscriptions, never from props, so typing
 * here cannot re-render the token tree around it. That matters most on mobile,
 * where re-rendering a passage's tokens is a documented multi-second JS-thread
 * block.
 *
 * `variant` decides how a blank answered from a `pictureSet` is printed, and it is
 * the caller that knows which printing the workbook used: `slot` (the default) is the
 * illustration box a passage prints, `cell` is the small tappable blank a map pin, a
 * numbered row or a table cell prints. Both open the same picture-choice dialog; see
 * `picture-blank-cell.tsx`.
 */
export function BlankField({
  blank,
  variant = 'slot',
}: {
  blank: BlankSpec;
  variant?: 'slot' | 'cell';
}) {
  const ctx = useTextbookTask();
  const t = useT();

  const getValue = useCallback(() => ctx!.store.getValue(blank.id), [ctx, blank.id]);
  const value = useSyncExternalStore(ctx!.store.subscribe, getValue, getValue);

  const getResult = useCallback(() => ctx!.store.getResult(), [ctx]);
  const result = useSyncExternalStore(ctx!.store.subscribe, getResult, getResult);

  const getSelected = useCallback(() => ctx!.selection.get() === blank.id, [ctx, blank.id]);
  const isSelected = useSyncExternalStore(ctx!.selection.subscribe, getSelected, getSelected);

  const blankResult = result?.blanks.find((b) => b.blankId === blank.id);
  const reveal = result && blankResult && !blankResult.correct ? blank.answer : null;
  const label = blankLabel(blank);

  // ── Answered inside a mock app, never by a blank widget ──
  if (blank.kind === 'goal') return null;

  // ── Worked example: pre-filled by the workbook, not editable, not scored ──
  if (blank.kind === 'given') {
    return (
      <span
        className="mx-0.5 inline-flex min-w-[2.5em] items-center justify-center rounded border border-dashed border-muted-foreground/50 bg-muted/40 px-1.5 align-baseline text-foreground"
        title={t('review.spell_correct_answer', { answer: blank.answer })}
      >
        {blank.answer}
      </span>
    );
  }

  const verdictClass = blankResult
    ? blankResult.correct
      ? 'border-green-600 bg-green-500/10'
      : 'border-destructive bg-destructive/10'
    : null;

  const handleChoose = () => {
    // Tapping a filled blank clears it; tapping an empty one selects it so the
    // word bank's next tap fills it.
    if (value) ctx!.store.setValue(blank.id, '');
    else ctx!.selection.toggle(blank.id);
  };

  // ── Typed entry ──
  if (blank.kind === 'type') {
    // The printed length is where the blank *starts*, not where it ends: it comes from
    // expectedLength, which defaults to the answer length and is set explicitly only for
    // dictation, where the workbook prints one box per expected character.
    const chars = Math.max(2, blank.expectedLength ?? blank.answer.length);
    // …and it grows with what has been typed. A fixed width clipped a longer answer
    // mid-word — the student could not read back what they had written, and a wrong answer
    // being longer than the right one is the normal case, not the exception.
    //
    // Measured in **em**, not `ch`: `1ch` is the width of the font's `0`, about half an em,
    // while a CJK glyph is a full em — so a two-character answer (一般) needed ~2em and was
    // given 3ch ≈ 1.5em, which cut the second character in half. `em` is also the input's own
    // font size, so the blank keeps its proportion at any text scale.
    const width = `calc(${Math.max(chars, glyphEms(value))}em + 1.25rem)`;
    return (
      <span className="mx-0.5 inline-flex items-baseline gap-1.5 align-baseline">
        <input
          type="text"
          value={value}
          onChange={(e) => ctx!.store.setValue(blank.id, e.target.value)}
          aria-label={label}
          style={{ width }}
          className={`rounded-sm border-0 border-b-2 bg-transparent px-1 text-center text-foreground outline-none focus:border-primary ${
            verdictClass ?? 'border-muted-foreground/60'
          }`}
        />
        {reveal && (
          <span className="text-sm font-medium text-green-600">
            {t('review.spell_correct_answer', { answer: reveal })}
          </span>
        )}
      </span>
    );
  }

  // A blank answering from a picture set is filled by tapping it and choosing a
  // picture, never by typing a letter. What the *shape* of that blank is depends on
  // what the workbook printed: a box for an illustration inside a passage (B ➎/➏), or
  // a small `( )` / `___` the answer's letter goes into (A ➊/➋/➌, C ➊/➋).
  if (blank.optionSet) {
    return variant === 'cell' ? (
      <PictureBlankCell blank={blank} value={value} result={blankResult} />
    ) : (
      <InlineImageSlot blank={blank} value={value} />
    );
  }

  // ── Choose from a bank ──
  return (
    <span className="mx-0.5 inline-flex items-baseline gap-1.5 align-baseline">
      <button
        type="button"
        onClick={handleChoose}
        aria-label={label}
        className={`inline-flex min-w-[3em] items-center justify-center rounded-sm border-0 border-b-2 px-1.5 text-foreground transition-colors ${
          verdictClass ??
          (isSelected
            ? 'border-primary bg-primary/10'
            : 'border-muted-foreground/60 hover:bg-muted/50')
        }`}
      >
        {value || <span className="text-muted-foreground">＿</span>}
      </button>
      {reveal && (
        <span className="text-sm font-medium text-green-600">
          {t('review.spell_correct_answer', { answer: reveal })}
        </span>
      )}
    </span>
  );
}
