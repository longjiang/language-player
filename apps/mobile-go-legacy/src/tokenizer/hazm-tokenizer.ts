import { addSpaceTokens } from './tokenizer-utils';
import { Token } from '@/types/tokenTypes';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  // console.log('🥝', tokens.slice(0,30))
  const normalizedTokens = addSpaceTokens(tokens.map(normalizeToken), text)
  // console.log('🍅', normalizedTokens.slice(0,30))
  return normalizedTokens;
}

function normalizeToken(token: any): Token {
  return {
    text: token.word,
    lemmas: token.lemmas,
    stem: token.stem,
    pronunciation: token.pronunciation
  }
}

export default { normalizeTokens };
