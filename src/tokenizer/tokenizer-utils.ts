// @/src/tokenizer/tokenizer-utils.ts

import { Token } from '@/types/tokenTypes';

export const addSpaceTokens = (tokens: Token[]): Token[] => {
  let newTokens: Token[] = [];
  let prevWasPunctuation = false;
  let insideQuote = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token.text;

    if (word === '"' || word === "'") {
      if (insideQuote) {
        newTokens.push(token);
        insideQuote = false;
      } else {
        if (newTokens.length > 0 && !prevWasPunctuation) {
          newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
        }
        newTokens.push(token);
        insideQuote = true;
      }
      prevWasPunctuation = true;
    } else if (word === "," || word === "." || word === ":" || word === ";") {
      newTokens.push(token);
      prevWasPunctuation = true;
    } else {
      if (newTokens.length > 0 && !prevWasPunctuation && !insideQuote) {
        newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
      }
      newTokens.push(token);
      prevWasPunctuation = false;
    }
  }

  return newTokens;
}