// @/src/tokenizer/tokenizer-utils.ts

import { Token } from '@/types/tokenTypes';

export const addSpaceTokens = (tokens: Token[]): Token[] => {
  let newTokens: Token[] = [];
  let insideQuote = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token.text;

    if (word === '"' || word === "'") {
      if (insideQuote) {
        newTokens.push(token);
        insideQuote = false;
      } else {
        if (newTokens.length > 0 && newTokens[newTokens.length - 1].text !== " ") {
          newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
        }
        newTokens.push(token);
        insideQuote = true;
      }
    } else if (word === "," || word === "." || word === ":" || word === ";") {
      newTokens.push(token);
      if (i < tokens.length - 1 && tokens[i + 1].text !== '"' && tokens[i + 1].text !== "'") {
        newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
      }
    } else {
      if (newTokens.length > 0 && newTokens[newTokens.length - 1].text !== " " && !insideQuote) {
        newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
      }
      newTokens.push(token);
    }
  }

  return newTokens;
}