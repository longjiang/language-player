import { Token, Lemma } from '@/src/tokenizer';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  return tokens.map(normalizeToken);
}

function normalizeToken(token: any): Token {
  return {
    text: token.word,
    lemmas: token.lemmas,
    pos: token.pos,
  }
}

export default { normalizeTokens };
