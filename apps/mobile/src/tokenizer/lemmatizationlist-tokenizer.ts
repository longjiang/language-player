import { addSpaceTokens } from './tokenizer-utils';
import { Token } from '@/types/tokenTypes';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  return addSpaceTokens(tokens.map(normalizeToken), text);
}

function normalizeToken(token: any): Token {
  return {
    text: token.word,
    lemmas: token.lemmas,
    pos: token.pos,
  }
}

export default { normalizeTokens };
