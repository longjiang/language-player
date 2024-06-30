import { Token, Lemma } from '@/src/tokenizer';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  console.log(tokens)
  return tokens.map(normalizeToken);
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
