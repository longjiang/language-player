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
    lemmas: token.lemmas.map((lemma: any) => ({
      lemma: lemma.lemma,
      part_of_speech: lemma.pos,
      morphologies: lemma.morphologies
    })),
    pronunciation: token.pronunciation
  }
}

export default { normalizeTokens };
