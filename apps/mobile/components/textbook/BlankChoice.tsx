import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { pictureSetsIn, type PictureSetStimulus } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useTextbookTask } from './task-provider';
import { useBlankPicker } from './blank-picker';
import { PictureOptionTile } from './PictureOptionTile';

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
 * The picture choices for a blank that answers from a `pictureSet`, in a dialog.
 *
 * A blank is answered by tapping it — which opens this dialog — and then tapping a
 * picture, which fills the blank with that picture's letter. That replaces the
 * two-step "select the blank, then scroll down to the picture bank and tap a picture"
 * flow: the student decides at the blank, on a control the size of the space the
 * workbook prints for it, instead of one large enough to cover the map it sits on.
 *
 * One dialog serves the whole task and is rendered here, beside the task, rather than
 * by each blank: a task can carry thirty blanks, and thirty modals is thirty focus
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

  const close = () => setOpenBlankId(null);

  return (
    <BlankChoiceContext.Provider value={value}>
      {children}

      <Modal
        visible={Boolean(blank && set)}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View className="flex-1 items-center justify-center bg-black/50 p-4">
          <View className="max-h-[85%] w-full max-w-2xl gap-3 rounded-xl bg-popover p-4">
            <View className="flex-row items-center gap-2">
              {/* The same message the blank itself carries, so the dialog's title is
                  the instruction the student tapped. */}
              <Text className="flex-1 text-base font-semibold text-foreground">
                {t('label.pick_illustration')}
              </Text>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('action.close')}
                hitSlop={10}
                className="h-8 w-8 items-center justify-center rounded-md border border-border"
              >
                <X size={16} color={ICON_MUTED} />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="flex-row flex-wrap gap-3">
              {set?.items.map((item) => (
                <View key={item.letter} className="w-[46%]">
                  <PictureOptionTile
                    item={item}
                    selected={current === item.letter}
                    onPick={(letter) => {
                      // A multi-select blank takes several picks, so the dialog stays
                      // open until the student closes it; a single answer closes on the
                      // tap.
                      if (blank?.multiple) {
                        pick(letter);
                        return;
                      }
                      // Tapping the answer already given takes it back. This dialog is
                      // the only place a mis-pick can be undone, because tapping the
                      // blank itself now opens the dialog rather than clearing it.
                      ctx.store.setValue(openBlankId!, current === letter ? '' : letter);
                      close();
                    }}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </BlankChoiceContext.Provider>
  );
}
