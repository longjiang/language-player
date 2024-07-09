// @/src/tokenizer/simplemma-tokenizer.ts

import { addSpaceTokens } from './tokenizer-utils';
import { Token } from '@/types/tokenTypes';

export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  let normalizedTokens = tokens.map(normalizeToken);
  normalizedTokens = addSpaceTokens(normalizedTokens, text);
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
