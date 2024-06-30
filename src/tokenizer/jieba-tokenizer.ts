import { Token, Lemma } from '@/src/tokenizer';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  return tokens.map(normalizeToken);
}

function normalizeToken(token: { word: string, pos: string, pronunciation: string }): Token {
  return {
    text: token.word,
    pos: token.pos,
    pronunciation: token.pronunciation
  }
}

export default { normalizeTokens };
