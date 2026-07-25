// @/src/tokenizer/tokenizer-utils.ts

import { Token } from '@/types/tokenTypes';

export const addSpaceTokens = (tokens: Token[], originalText: string): Token[] => {
  let newTokens: Token[] = [];
  const spaceToken = { text: " ", pos: undefined, lemmas: [], pronunciation: undefined };

  let tokenIndex = 0;
  let originalIndex = 0;

  while (originalIndex < originalText.length) {
    const currentChar = originalText[originalIndex];

    if (currentChar === ' ') {
      newTokens.push({ ...spaceToken });
      originalIndex++;
    } else {
      if (tokenIndex < tokens.length && originalText.startsWith(tokens[tokenIndex].text, originalIndex)) {
        newTokens.push(tokens[tokenIndex]);
        originalIndex += tokens[tokenIndex].text.length;
        tokenIndex++;
      } else {
        // Handle cases where token and text do not align perfectly (e.g., punctuation, special characters)
        newTokens.push({ text: currentChar, pos: undefined, lemmas: [], pronunciation: undefined });
        originalIndex++;
      }
    }
  }

  return newTokens;
}
