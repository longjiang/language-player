import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * App-wide text input — stock react-native-reusables/shadcn defaults (no
 * customizations other than the app's color tokens): border-input border,
 * bg-background, fixed h-10, rounded-md, text-base, subtle shadow.
 *
 * Callsites add ONLY layout classes (flex-1, mb-*, w-full…); visual styling
 * overrides (bg, border, rounded, padding, height, text-size) are not used.
 */
export function Input({ className, ...props }: TextInputProps) {
  return (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5',
        'placeholder:text-muted-foreground/50',
        props.editable === false && 'opacity-50',
        className,
      )}
      placeholderTextColor={props.placeholderTextColor}
      {...props}
    />
  );
}

/**
 * Multi-line text input — stock react-native-reusables/shadcn defaults:
 * min-h-16, top-aligned, no fixed height so editors can grow (flex-1 via
 * className). Replaces raw `<TextInput multiline textAlignVertical="top">`.
 */
export function Textarea({ className, style, ...props }: TextInputProps) {
  return (
    <TextInput
      multiline
      className={cn(
        'dark:bg-input/30 border-input text-foreground flex min-h-16 w-full flex-row rounded-md border bg-transparent px-3 py-2 text-base shadow-sm shadow-black/5',
        'placeholder:text-muted-foreground/50',
        props.editable === false && 'opacity-50',
        className,
      )}
      style={[{ textAlignVertical: 'top' }, style]}
      placeholderTextColor={props.placeholderTextColor}
      {...props}
    />
  );
}
