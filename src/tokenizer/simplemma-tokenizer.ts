// @/src/tokenizer/simplemma-tokenizer.ts

import { Token, Lemma } from '@/src/tokenizer';

export const addSpaceTokens = (tokens: Token[], text: string): Token[] => {
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

export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  // console.log('🫐', tokens)
  let normalizedTokens = tokens.map(normalizeToken);
  // console.log('🍋', normalizedTokens);
  normalizedTokens = addSpaceTokens(normalizedTokens, text);
  // console.log('🍒', normalizedTokens);
  return normalizedTokens;
}

function normalizeToken(token: any): Token {
  return {
    text: token.word,
    pos: token.pos,
    lemmas: [{ lemma: token.lemma }],
    pronunciation: token.pronunciation
  }
}

export default { normalizeTokens };
