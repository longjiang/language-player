import React, { useCallback, useSyncExternalStore } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { indexToCircled, type BlankSpec } from '@langplayer/textbooks';
import { glyphEms } from '@langplayer/utils';
import { useTextbookTask } from './task-provider';
import { useT } from '@/hooks/use-t';
import { ICON_PRIMARY, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { InlineImageSlot } from './InlineImageSlot';
import { PictureBlankCell } from './PictureBlankCell';

/** The workbook identifies questions by circled numeral; blanks share that index. */
function blankLabel(blank: BlankSpec): string {
  const n = Number(blank.id.replace(/^b/, ''));
  return Number.isFinite(n) ? indexToCircled(n) : blank.id;
}

/**
 * One interactive blank, rendered inline in the tokenized passage.
 *
 * A sibling of the token views, never inside one, so the words on either side
 * stay tappable for the dictionary. All state comes from per-blank
 * subscriptions rather than props, so typing here cannot re-render the token
 * tree — which on this platform is the difference between a responsive task and
 * a frozen one.
 */
/** The field's own type scale (`text-base`), one em of it per full-width glyph. */
const FIELD_FONT_SIZE = 16;

export function BlankField({
  blank,
  variant = 'slot',
}: {
  blank: BlankSpec;
  /**
   * How a blank answered from a `pictureSet` is printed: `slot` is the illustration box
   * a passage prints (B ➎/➏), `cell` the small tappable blank a map pin, numbered row
   * or table cell prints (A ➊/➋/➌, C ➊/➋). Both open the same picture-choice dialog.
   */
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
      <View className="mx-0.5 mb-0.5 flex-row items-center rounded border border-dashed border-border bg-muted/40 px-1.5">
        <Text className="text-base text-foreground">{blank.answer}</Text>
      </View>
    );
  }

  const verdictStyle = blankResult
    ? blankResult.correct
      ? { borderBottomColor: '#16a34a' }
      : { borderBottomColor: '#dc2626' }
    : null;

  const fill = (next: string) => ctx!.store.setValue(blank.id, next);

  // ── Typed entry ──
  if (blank.kind === 'type') {
    // Boxed width comes from expectedLength, which defaults to the answer
    // length; it is set explicitly only for dictation, where the workbook
    // prints one box per expected character.
    const chars = Math.max(2, blank.expectedLength ?? blank.answer.length);
    // Wide enough for what is typed, measured the same way on both platforms: a CJK glyph is
    // a full em and everything else about half (`glyphEms`). This was `chars * 14`, which
    // under-sized a 16px glyph — and RN sizes a text field to its content, so on a platform
    // where it did not, the answer's last character would be hidden exactly as it was on web.
    const typed = Math.max(chars, glyphEms(value)) * FIELD_FONT_SIZE;
    return (
      <View className="mx-0.5 mb-0.5 flex-row items-center">
        <TextInput
          value={value}
          onChangeText={fill}
          accessibilityLabel={label}
          placeholderTextColor={PLACEHOLDER_COLOR}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            { minWidth: typed + 16, borderBottomWidth: 2, borderBottomColor: ICON_PRIMARY },
            verdictStyle ?? {},
          ]}
          className="px-1 text-center text-base text-foreground"
        />
        {reveal && (
          <Text className="ml-1.5 text-sm font-medium text-green-600">
            {t('review.spell_correct_answer', { answer: reveal })}
          </Text>
        )}
      </View>
    );
  }

  // A blank answering from a picture set is filled by tapping it and choosing a
  // picture, never by typing a letter. What the *shape* of that blank is depends on what
  // the workbook printed: a box for an illustration inside a passage, or a small `( )` /
  // `___` the answer's letter goes into.
  if (blank.optionSet) {
    return variant === 'cell' ? (
      <PictureBlankCell blank={blank} value={value} result={blankResult} />
    ) : (
      <InlineImageSlot blank={blank} value={value} />
    );
  }

  // ── Choose from a bank ──
  // Tapping a bank blank always SELECTS it. It never clears and never deselects: a filled
  // blank is re-answered by picking another option (which replaces it), and a blank a stray
  // second tap had deselected would silently swallow the next option tap. Re-tapping the same
  // blank is therefore a no-op rather than a toggle.
  const handleChoose = () => ctx!.selection.set(blank.id);

  return (
    <View className="mx-0.5 mb-0.5 flex-row items-center">
      <Pressable
        onPress={handleChoose}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={`rounded px-1.5 py-0.5 ${
          blankResult
            ? blankResult.correct
              ? 'bg-green-500/20'
              : 'bg-destructive/20'
            : isSelected
              ? 'bg-primary/20'
              : 'bg-muted/40'
        }`}
        style={[{ borderBottomWidth: 2, borderBottomColor: ICON_PRIMARY }, verdictStyle ?? {}]}
      >
        {/* Empty is empty, and `min-w` is what keeps it visible: the blank's own bottom
            border is the line to write on, so a placeholder underscore inside it drew a second
            line over the first. */}
        <Text className="min-w-[28px] text-center text-base text-foreground">{value}</Text>
      </Pressable>
      {reveal && (
        <Text className="ml-1.5 text-sm font-medium text-green-600">
          {t('review.spell_correct_answer', { answer: reveal })}
        </Text>
      )}
    </View>
  );
}

/**
 * Read-only blank for the plain inline render path.
 *
 * That path renders the whole block as sibling `<Text>` children inside one
 * ancestor `<Text>`, where a `TextInput` or `Pressable` cannot live (the same
 * constraint that makes note badges degrade there). It is only reached for
 * `inline` tokenized text — AI-explanation spans — never for a textbook passage,
 * which is block-level and takes the flex path. The value is still live so the
 * display cannot go stale if one is ever used inline.
 */
export function InlineBlankText({ blank }: { blank: BlankSpec }) {
  const ctx = useTextbookTask();
  const getValue = useCallback(() => ctx!.store.getValue(blank.id), [ctx, blank.id]);
  const value = useSyncExternalStore(ctx!.store.subscribe, getValue, getValue);
  return (
    <Text className="text-primary">
      {blank.kind === 'given' ? blank.answer : value || '＿'}
    </Text>
  );
}
