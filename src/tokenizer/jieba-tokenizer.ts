import { Token } from '@/types/tokenTypes';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  return tokens.map(normalizeToken);
}

function normalizeToken(token: any): Token {
  return {
    text: token.word,
    pos: token.pos,
    pronunciation: token.pronunciation
  }
}

export default { normalizeTokens };
