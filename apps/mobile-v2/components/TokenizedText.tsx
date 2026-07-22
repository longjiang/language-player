import React from 'react';
import { Text } from 'react-native';

interface LemmatizedToken {
  text: string;
  lemmas?: { text: string }[];
  pronunciation?: string;
}

interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
  onWordPress?: (word: string) => void;
  /** Pre-computed lemmatized tokens with correct word boundaries. */
  tokens?: LemmatizedToken[];
}

/**
 * Renders text as tappable word tokens.
 * If `tokens` is provided (from server-side lemmatization), uses those
 * word boundaries. Otherwise, falls back to character-level (CJK) or
 * word-level (space-separated) splitting.
 */
export function TokenizedText({ text, l2Code, highlightTerms, onWordPress, tokens }: TokenizedTextProps) {
  // Use server-side lemmatized tokens if available
  if (tokens && tokens.length > 0) {
    return (
      <Text className="text-base leading-relaxed text-foreground">
        {tokens.map((token, i) => {
          const word = token.text;
          const isHighlighted = highlightTerms?.some((t) => t === word);
          return (
            <Text
              key={i}
              onPress={() => onWordPress?.(word)}
              className={isHighlighted ? 'font-bold text-primary' : ''}
            >
              {word}
            </Text>
          );
        })}
      </Text>
    );
  }

  // Fallback: basic splitting
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);

  if (isCJK) {
    const chars = [...text];
    return (
      <Text className="text-base leading-relaxed text-foreground">
        {chars.map((char, i) => {
          const isHighlighted = highlightTerms?.some((t) => char === t);
          return (
            <Text
              key={i}
              onPress={() => onWordPress?.(char)}
              className={isHighlighted ? 'font-bold text-primary' : ''}
            >
              {char}
            </Text>
          );
        })}
      </Text>
    );
  }

  const words = text.split(/(\s+)/);
  return (
    <Text className="text-base leading-relaxed text-foreground">
      {words.map((word, i) => {
        const trimmed = word.trim();
        const isHighlighted = highlightTerms?.some((t) => t === trimmed);
        return (
          <Text
            key={i}
            onPress={() => trimmed && onWordPress?.(trimmed)}
            className={isHighlighted ? 'font-bold text-primary' : ''}
          >
            {word}
          </Text>
        );
      })}
    </Text>
  );
}
