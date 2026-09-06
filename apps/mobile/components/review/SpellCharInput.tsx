import React, { useMemo, useState } from 'react';
import { TextInput, View, Text } from 'react-native';

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
}

export function SpellCharInput({
  value,
  onChange,
  expectedLength,
  autoFocus = false,
  label,
}: SpellCharInputProps) {
  const chars = useMemo(() => Array.from(value), [value]);
  const boxCount = Math.max(1, expectedLength, chars.length);
  const [caret, setCaret] = useState(0);
  const activeIndex = Math.min(chars.length, Math.max(0, caret));

  return (
    <View className="relative w-full">
      <View className="flex-row flex-wrap items-center justify-center gap-1.5">
        {Array.from({ length: boxCount }).map((_, i) => {
          const ch = chars[i] ?? '';
          const isActive = i === activeIndex;
          return (
            <View
              key={i}
              className={`h-11 w-10 items-center justify-center rounded-lg border transition-colors ${
                isActive ? 'border-primary' : 'border-border'
              }`}
            >
              {ch ? <Text className="text-lg font-medium text-foreground">{ch}</Text> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSelectionChange={({ nativeEvent }) => setCaret(nativeEvent.selection.start ?? value.length)}
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
