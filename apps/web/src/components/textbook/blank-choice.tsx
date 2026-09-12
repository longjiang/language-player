'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { pictureSetsIn, type PictureSetStimulus } from '@langplayer/textbooks';
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

  const getValue = useCallback(
    () => (openBlankId ? ctx.store.getValue(openBlankId) : ''),
    [ctx, openBlankId],
  );
  const current = useSyncExternalStore(ctx.store.subscribe, getValue, getValue);

  return (
    <BlankChoiceContext.Provider value={value}>
      {children}

      <Dialog
        open={Boolean(blank && set)}
        onOpenChange={(next) => {
          if (!next) setOpenBlankId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            {/* The same message the blank itself carries, so the dialog's title is the
                instruction the student tapped ("Tap to choose a picture"). */}
            <DialogTitle>{t('label.pick_illustration')}</DialogTitle>
          </DialogHeader>

          {set && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {set.items.map((item) => (
                <PictureOptionTile
                  key={item.letter}
                  item={item}
                  selected={current === item.letter}
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
        </DialogContent>
      </Dialog>
    </BlankChoiceContext.Provider>
  );
}
