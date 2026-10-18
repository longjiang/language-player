import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { PanResponder, View } from 'react-native';
import { GripVertical } from 'lucide-react-native';
import {
  moveRow,
  moveRowBy,
  orderFromPositions,
  sameOrder,
  type OrderListItem,
  type OrderListStimulus,
} from '@langplayer/textbooks';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useTextbookTask } from './task-provider';
import { BlankField } from './BlankField';

/**
 * A list of rows the student drags into the recording's order (SPEC-095, D ➋).
 *
 * The workbook printed a table whose first column was a blank for the position (1–5) and whose
 * third was a blank for the row's description. Picking a number from a dropdown asks the student
 * to translate an ordering into digits; dragging the rows is the exercise. The description
 * picker stays — that is matching, not ordering.
 *
 * **The position is still a stored blank.** A drop writes each row's 1-based index into its
 * position blank, so grading, the answer key and the green/red verdicts are the existing
 * per-blank machinery and nothing about the response model changed. The first run of a fresh
 * task seeds the authored arrangement, so submitting without dragging grades the list the
 * student can see rather than five empty blanks.
 *
 * The drag is a `PanResponder` on the handle (no new dependency), released onto the row index
 * computed from the finger's travel over the row's measured height. Locked rows — the printed
 * worked example — have an inert grip and keep their slot.
 */
export function OrderList({ stimulus }: { stimulus: OrderListStimulus }) {
  const ctx = useTextbookTask()!;
  const t = useT();
  const { l2Lang } = useLanguage();

  const rows = stimulus.items;
  const authored = useMemo(() => rows.map((row) => row.id), [rows]);
  const byId = useMemo(
    () => new Map<string, OrderListItem>(rows.map((row) => [row.id, row] as const)),
    [rows],
  );

  const getResponses = useCallback(() => ctx.store.getResponsesSnapshot(), [ctx]);
  const responses = useSyncExternalStore(ctx.store.subscribe, getResponses, getResponses);
  const getResult = useCallback(() => ctx.store.getResult(), [ctx]);
  const result = useSyncExternalStore(ctx.store.subscribe, getResult, getResult);

  const [order, setOrder] = useState<string[]>(authored);
  const [dragId, setDragId] = useState<string | null>(null);
  const heights = useRef<Record<string, number>>({});

  // The stored positions are the truth (a reload, or this component's own writes); the authored
  // order is only the fallback while they are incomplete.
  useEffect(() => {
    const stored = orderFromPositions(rows, responses);
    setOrder((previous) => (sameOrder(previous, stored) ? previous : stored));
  }, [rows, responses]);

  // A fresh task: record the arrangement on screen as the answer the student starts from. Only
  // when every draggable row is empty — a restored order is never overwritten.
  useEffect(() => {
    const draggable = rows.filter((row) => !row.locked);
    if (draggable.some((row) => responses[row.blankId])) return;
    rows.forEach((row, index) => {
      if (!row.locked) ctx.store.setValue(row.blankId, String(index + 1));
    });
  }, [rows, responses, ctx]);

  const commit = useCallback(
    (next: string[]) => {
      if (sameOrder(next, order)) return;
      setOrder(next);
      next.forEach((id, index) => {
        const row = byId.get(id)!;
        if (!row.locked) ctx.store.setValue(row.blankId, String(index + 1));
      });
    },
    [order, byId, ctx],
  );

  const beginDrag = useCallback(
    (id: string) => {
      setDragId(id);
    },
    [],
  );

  const finishDrag = useCallback(
    (id: string, dy: number) => {
      setDragId(null);
      const height = heights.current[id] ?? 56;
      const steps = Math.round(dy / height);
      if (!steps) return;
      const draggableIds = order.filter((current) => !byId.get(current)!.locked);
      const from = draggableIds.indexOf(id);
      if (from < 0) return;
      const target = Math.max(0, Math.min(draggableIds.length - 1, from + steps));
      const targetId = draggableIds[target];
      if (targetId) commit(moveRow(order, rows, id, targetId));
    },
    [order, byId, rows, commit],
  );

  const verdictFor = (rowId: string): 'correct' | 'incorrect' | null => {
    if (!result) return null;
    const row = byId.get(rowId)!;
    const blank = ctx.task.blanks?.[row.blankId];
    if (blank?.kind === 'given') return 'correct';
    const verdict = result.blanks.find((entry) => entry.blankId === row.blankId);
    return verdict?.correct ? 'correct' : 'incorrect';
  };

  return (
    <View className="gap-2">
      {order.map((id) => {
        const row = byId.get(id)!;
        const verdict = verdictFor(id);
        const description = row.descriptionBlankId
          ? ctx.task.blanks?.[row.descriptionBlankId]
          : undefined;
        return (
          <View
            key={id}
            onLayout={(event) => {
              heights.current[id] = event.nativeEvent.layout.height;
            }}
            className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 ${
              verdict === 'correct'
                ? 'border-green-600 bg-green-500/10'
                : verdict === 'incorrect'
                  ? 'border-destructive bg-destructive/10'
                  : 'border-border bg-card'
            } ${dragId === id ? 'opacity-60' : ''}`}
          >
            {row.locked ? (
              <View className="h-6 w-6 items-center justify-center opacity-40">
                <GripVertical size={16} color={ICON_MUTED} />
              </View>
            ) : (
              <OrderHandle
                label={t('label.drag_to_reorder')}
                onBegin={() => beginDrag(id)}
                onFinish={(dy) => finishDrag(id, dy)}
                onStep={(delta) => commit(moveRowBy(order, rows, id, delta))}
              />
            )}

            <View className="min-w-0 flex-1">
              <TokenizedText text={row.text} l2Code={l2Lang.code} inline />
            </View>

            {description ? <BlankField blank={description} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The drag handle: a `PanResponder` over the grip, with accessibility actions so the order can be
 * changed without dragging. Callbacks go through refs, so the responder does not have to be
 * rebuilt (and a gesture does not have to survive) every time the order changes.
 */
function OrderHandle({
  label,
  onBegin,
  onFinish,
  onStep,
}: {
  label: string;
  onBegin: () => void;
  onFinish: (dy: number) => void;
  onStep: (delta: number) => void;
}) {
  const begin = useRef(onBegin);
  const finish = useRef(onFinish);
  begin.current = onBegin;
  finish.current = onFinish;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => begin.current(),
        onPanResponderRelease: (_event, gesture) => finish.current(gesture.dy),
        onPanResponderTerminate: (_event, gesture) => finish.current(gesture.dy),
      }),
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1);
      }}
      className="h-6 w-6 items-center justify-center rounded"
    >
      <GripVertical size={16} color={ICON_MUTED} />
    </View>
  );
}
