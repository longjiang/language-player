import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View, Text } from 'react-native';
import { srsLogger } from '@/lib/logger';

const { log } = srsLogger;

/**
 * Segmented character-count input for SRS spell mode (SPEC-066).
 *
 * The learner types the blanked word into a SINGLE real `TextInput` whose value
 * is distributed one character per box, left to right. Because it is one native
 * field, IME composition (pinyin/kana) works normally: React Native owns the
 * value and composition, and the boxes are purely a visual distribution of that
 * value — the app never rewrites the text, so an IME's "enter to confirm" and
 * live composition previews are never broken.
 *
 * The field is layered transparently over the boxes so every tap lands in it;
 * the box under the caret is highlighted (RN's native cursor is invisible on an
 * `opacity: 0` field).
 */
export interface SpellCharInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Expected character count of the correct blanked word — drives the box count. */
  expectedLength: number;
  autoFocus?: boolean;
  /** Accessible label for the invisible input. */
  label?: string;
  /** Muted type-over placeholder shown in the FIRST character box only, while
   *  it is empty. Passed the orthographic hint's first character. */
  firstCharPlaceholder?: string;
}

export function SpellCharInput({
  value,
  onChange,
  expectedLength,
  autoFocus = false,
  label,
  firstCharPlaceholder,
}: SpellCharInputProps) {
  const chars = useMemo(() => Array.from(value), [value]);
  const boxCount = Math.max(1, expectedLength, chars.length);
  const [caret, setCaret] = useState(0);
  const activeIndex = Math.min(chars.length, Math.max(0, caret));
  const inputRef = useRef<TextInput>(null);

  // Diagnostic: confirm the field mounts with autoFocus and whether a touch
  // lands here vs being swallowed by the surrounding ScrollView's pan
  // recognizer (SPEC-066 spell slot → keyboard bug).
  useEffect(() => {
    log('[srs-spell] input mounted', { autoFocus, expectedLength, placeholder: !!firstCharPlaceholder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Focus the real field whenever ANY part of the input area is touched. The
   * transparent TextInput overlays the boxes, but inside the review ScrollView
   * a tap can be swallowed by the ScrollView's gesture handling so the field
   * never re-becomes first responder after a blur (SPEC-066 spell slot → no
   * keyboard). This mirrors the web component's `onClick={() => input.focus()}`
   * and guarantees a slot tap raises the keyboard. We return false so we never
   * claim the responder and the field's own touch/caret/IME behaviour is
   * unchanged — focusing an already-focused field is a no-op.
   */
  const handleContainerTouch = () => {
    inputRef.current?.focus();
    log('[srs-spell] tap-to-focus fired', { value });
  };

  return (
    <View
      className="relative w-full"
      onStartShouldSetResponder={() => {
        handleContainerTouch();
        return false; // observe only — never claim the responder
      }}
    >
      <View className="flex-row flex-wrap items-center justify-center gap-1.5">
        {Array.from({ length: boxCount }).map((_, i) => {
          const ch = chars[i] ?? '';
          const isActive = i === activeIndex;
          const placeholder = i === 0 && !ch ? firstCharPlaceholder : null;
          return (
            <View
              key={i}
              className={`h-11 w-10 items-center justify-center rounded-lg border transition-colors ${
                isActive ? 'border-primary' : 'border-border'
              }`}
            >
              {ch ? <Text className="text-lg font-medium text-foreground">{ch}</Text>
                : placeholder ? <Text className="text-lg font-medium text-muted-foreground/50">{placeholder}</Text>
                : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        onSelectionChange={({ nativeEvent }) => setCaret(nativeEvent.selection.start ?? value.length)}
        onFocus={() => log('[srs-spell] TextInput focused')}
        onBlur={() => log('[srs-spell] TextInput blurred')}
        onTouchStart={() => log('[srs-spell] TextInput touch start')}
        onTouchCancel={() => log('[srs-spell] TextInput touch CANCELED (ScrollView stole it?)')}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        accessibilityLabel={label}
        caretHidden
        returnKeyType="done"
        blurOnSubmit={false}
        className="absolute top-0 left-0 h-full w-full opacity-0"
      />
    </View>
  );
}
