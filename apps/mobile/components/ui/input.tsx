import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * App-wide text input (react-native-reusables pattern, adapted to this app's
 * tokens). One input look everywhere: `border-input` border, `bg-background`,
 * rounded-lg, text-sm. Callsites override sizing/spacing via className
 * (merged with `cn`, so e.g. `border-0 bg-muted` for search bars wins).
 */
export function Input({ className, ...props }: TextInputProps) {
  return (
    <TextInput
      className={cn(
        'rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        props.editable === false && 'opacity-50',
        className,
      )}
      placeholderTextColor={props.placeholderTextColor}
      {...props}
    />
  );
}

/**
 * Multi-line text input: top-aligned text, a taller minimum height, and no
 * fixed height so editors can grow (`flex-1` etc. via className). Replaces
 * raw `<TextInput multiline textAlignVertical="top">` usages.
 */
export function Textarea({ className, style, ...props }: TextInputProps) {
  return (
    <TextInput
      multiline
      className={cn(
        'min-h-28 rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        props.editable === false && 'opacity-50',
        className,
      )}
      style={[{ textAlignVertical: 'top' }, style]}
      placeholderTextColor={props.placeholderTextColor}
      {...props}
    />
  );
}
