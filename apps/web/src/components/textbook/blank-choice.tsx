'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  bankChoiceOptions,
  bankInDialog,
  pickValues,
  pictureSetsIn,
  type PictureSetStimulus,
} from '@langplayer/textbooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankPicker } from './blank-picker';
import { PictureOptionTile } from './picture-option-tile';

interface BlankChoiceValue {
  /** Open the picture choices for a blank. */
  open: (blankId: string) => void;
}

const BlankChoiceContext = createContext<BlankChoiceValue | null>(null);

/** The task's blank-choice opener, or null outside a task. */
export function useBlankChoice(): BlankChoiceValue | null {
  return useContext(BlankChoiceContext);
}

/**
 * The choices for a blank, in a modal: a `pictureSet`'s pictures, or a bank whose options are
 * offered here rather than as a pool (`Bank.choicesInDialog`).
 *
 * Both are "answer at the blank": the options are the thing being compared, and for B ➌ — four
 * seat classes with photographs, asked about in the middle of a sentence — the pool alternative
 * puts the pictures a screen away from the question. A bank's tiles read the same way as a
 * picture set's: the item in bold (无座) beside its label (（站着）), over its photograph.
 *
 * The picture choices for a blank that answers from a `pictureSet`, in a modal.
 *
 * A blank is answered by tapping it — which opens this dialog — and then tapping a
 * picture, which fills the blank with that picture's letter. That replaces the
 * two-step "select the blank, then scroll down to the picture bank and tap a picture"
 * flow: the student decides at the blank, on a control the size of the space the
 * workbook prints for it, instead of one large enough to cover the map it sits on.
 *
 * One dialog serves the whole task and is rendered here, beside the task, rather than
 * by each blank: a task can carry thirty blanks, and thirty dialogs is thirty focus
 * traps waiting to be open at the same time.
 */
export function BlankChoiceProvider({ children }: { children: React.ReactNode }) {
  const ctx = useTextbookTask()!;
  const t = useT();
  const { pick } = useBlankPicker();
  // Which blank's choices are open. Deliberately not the same thing as `selection`
  // (which blank the picture bank will fill): closing the dialog must not disarm the
  // bank, and the bank must not close the dialog.
  const [openBlankId, setOpenBlankId] = useState<string | null>(null);

  const open = useCallback(
    (blankId: string) => {
      // Selecting is what arms `pick`, so the bank and this dialog fill a blank
      // through one code path.
      ctx.selection.set(blankId);
      setOpenBlankId(blankId);
    },
    [ctx],
  );

  const value = useMemo<BlankChoiceValue>(() => ({ open }), [open]);

  const blank = openBlankId ? ctx.task.blanks?.[openBlankId] : undefined;
  const set: PictureSetStimulus | undefined = blank?.optionSet
    ? pictureSetsIn(ctx.task).get(blank.optionSet)
    : undefined;
  // A bank's options are its items — the class *is* the answer, unlike a picture set whose letter
  // is a marker for a picture — so the tiles are keyed by item.
  const bank =
    !set && blank?.bank && bankInDialog(ctx.task, blank.bank)
      ? (ctx.task.banks ?? []).find((b) => b.id === blank.bank)
      : undefined;
  const options: { letter: string; label: string; image?: string }[] = set
    ? set.items
    : bank
      ? bankChoiceOptions(bank)
      : [];
  const dialogOpen = Boolean(blank && (set || bank));

  const getValue = useCallback(
    () => (openBlankId ? ctx.store.getValue(openBlankId) : ''),
    [ctx, openBlankId],
  );
  const current = useSyncExternalStore(ctx.store.subscribe, getValue, getValue);

  // Which options are chosen. A `multiple` blank stores its picks in ONE string (`硬卧、软卧`), so
  // comparing that string to a single option highlights the first pick and then highlights nothing
  // at all once a second is added — which is what a student picking two sleeping berths saw.
  const chosen = useMemo(() => new Set(pickValues(current)), [current]);
  const isChosen = (value: string) => (blank?.multiple ? chosen.has(value) : current === value);

  return (
    <BlankChoiceContext.Provider value={value}>
      {children}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) setOpenBlankId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            {/* A picture set's title is the instruction the student tapped ("Tap to choose a
                picture"); a bank's options are words with pictures, so it asks for a choice
                rather than for a picture. */}
            <DialogTitle>
              {set ? t('label.pick_illustration') : t('msg.please_select_option')}
            </DialogTitle>
          </DialogHeader>

          {dialogOpen && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {options.map((item) => (
                <PictureOptionTile
                  key={item.letter}
                  item={item}
                  selected={isChosen(item.letter)}
                  onPick={(letter) => {
                    // A multi-select blank takes several picks, so the dialog stays open
                    // until the student closes it; a single answer closes on the tap.
                    if (blank?.multiple) {
                      pick(letter);
                      return;
                    }
                    // Tapping the answer already given takes it back. This dialog is the
                    // only place a mis-pick can be undone, because tapping the blank
                    // itself now opens the dialog rather than clearing it.
                    ctx.store.setValue(openBlankId!, current === letter ? '' : letter);
                    setOpenBlankId(null);
                  }}
                />
              ))}
            </div>
          )}

          {/* A blank that takes several picks needs a way to say "done": each tap writes its
              pick, the dialog stays open, and this closes it. A single answer needs no button —
              the tap *is* the confirmation, and the dialog closes with it. */}
          {dialogOpen && blank?.multiple && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpenBlankId(null)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('action.confirm')}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BlankChoiceContext.Provider>
  );
}
