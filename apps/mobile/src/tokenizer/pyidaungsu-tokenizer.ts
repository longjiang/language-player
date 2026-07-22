import { Token } from '@/types/tokenTypes';

export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  return tokens.map(normalizeToken)
}

function normalizeToken(token: any): Token {
  return { text: token.word };
}

export default { normalizeTokens };
