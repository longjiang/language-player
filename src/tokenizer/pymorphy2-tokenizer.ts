import { Token, addSpaceTokens } from '@/src/tokenizer';

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
      pos: lemma.pos,
      morphologies: lemma.morphologies
    })),
    pronunciation: token.pronunciation
  }
}

export default { normalizeTokens };
