import React from 'react';
import { Text } from 'react-native';

interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
  onWordPress?: (word: string) => void;
}

/**
 * Renders text as tappable word tokens.
 * CJK text: character-level tokens.
 * Space-separated: word-level tokens.
 * Tapping a word calls onWordPress with the word text.
 */
export function TokenizedText({ text, l2Code, highlightTerms, onWordPress }: TokenizedTextProps) {
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
