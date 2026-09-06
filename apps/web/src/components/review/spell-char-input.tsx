'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * Segmented character-count input for SRS spell mode (SPEC-066).
 *
 * The learner types the blanked word into a SINGLE real text field whose
 * value is distributed one character per box, left to right. Because it is one
 * native input, IME composition (pinyin/kana) works normally: the control owns
 * the value and the composition, and the boxes are purely a visual distribution
 * of that value — no interceptor ever rewrites the text, so an IME's "enter to
 * confirm" and mid-composition previews are never broken.
 *
 * The hidden field is layered transparently over the boxes so every tap and
 * keystroke lands in it; the box under the caret is highlighted instead of the
 * native caret (which is invisible on an `opacity: 0` field).
 */
export interface SpellCharInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter (web only) with the same IME guard as the review page. */
  onSubmit: () => void;
  /** Expected character count of the correct blanked word — drives the box count. */
  expectedLength: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Accessible label for the invisible input. */
  label?: string;
  /** Optional id forwarded to the hidden input (for a `<label htmlFor>`). */
  id?: string;
}

export function SpellCharInput({
  value,
  onChange,
  onSubmit,
  expectedLength,
  autoFocus = false,
  disabled = false,
  label,
  id,
}: SpellCharInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [composing, setComposing] = useState(false);

  const chars = useMemo(() => Array.from(value), [value]);
  const boxCount = Math.max(1, expectedLength, chars.length);
  // Active cell = caret position; while composing, show the caret at the end of
  // the live composition so the underline lands on the final composing cell.
  const activeIndex = Math.min(chars.length, Math.max(0, composing ? chars.length : caret));

  const syncCaret = (el: HTMLInputElement) => {
    setCaret(el.selectionStart ?? el.value.length);
  };

  return (
    <div className="relative w-full" onClick={() => inputRef.current?.focus()}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {Array.from({ length: boxCount }).map((_, i) => {
          const ch = chars[i] ?? '';
          const isActive = i === activeIndex && !disabled;
          return (
            <div
              key={i}
              className={`flex h-11 w-10 items-center justify-center rounded-lg border text-lg font-medium transition-colors ${
                isActive ? 'border-primary ring-2 ring-primary/30' : 'border-border'
              }`}
            >
              <span className={ch ? 'text-foreground' : ''}>{ch}</span>
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          syncCaret(e.target);
        }}
        onKeyDown={(e) => {
          // Submit on Enter, but never while an IME is confirming its
          // candidate — browsers mark the commit keydown as composing
          // (`isComposing` true, or the legacy `keyCode === 229`), so
          // Japanese/Chinese input's "enter to confirm" won't submit.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && value.trim()) {
            onSubmit();
          }
        }}
        onSelect={(e) => syncCaret(e.currentTarget)}
        onClick={(e) => syncCaret(e.currentTarget)}
        onKeyUp={(e) => syncCaret(e.currentTarget)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false);
          syncCaret(e.currentTarget);
        }}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={label}
        id={id}
        enterKeyHint="done"
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
