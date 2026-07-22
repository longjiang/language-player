import React from 'react';
import { View, Text } from 'react-native';

interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
}

/**
 * Renders a subtitle line as tappable word tokens.
 * Phase 3 stub: shows plain text with basic word splitting.
 * Full version (Phase 4+) will integrate server-side lemmatization
 * and open the dictionary popup on word tap.
 */
export function TokenizedText({ text, l2Code, highlightTerms }: TokenizedTextProps) {
  // Simple word splitting — CJK characters get individual tokens,
  // space-separated languages get word tokens
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);

  if (isCJK) {
    // Character-level tokens for CJK
    const chars = [...text];
    return (
      <Text className="text-base leading-relaxed text-foreground">
        {chars.map((char, i) => {
          const isHighlighted = highlightTerms?.some((t) => char === t);
          return (
            <Text
              key={i}
              className={isHighlighted ? 'font-bold text-primary' : ''}
            >
              {char}
            </Text>
          );
        })}
      </Text>
    );
  }

  // Word-level tokens for space-separated languages
  const words = text.split(/(\s+)/);
  return (
    <Text className="text-base leading-relaxed text-foreground">
      {words.map((word, i) => {
        const trimmed = word.trim();
        const isHighlighted = highlightTerms?.some((t) => t === trimmed);
        return (
          <Text
            key={i}
            className={isHighlighted ? 'font-bold text-primary' : ''}
          >
            {word}
          </Text>
        );
      })}
    </Text>
  );
}
