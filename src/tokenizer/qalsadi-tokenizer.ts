import { addSpaceTokens } from './tokenizer-utils';
import { Token } from '@/types/tokenTypes';


interface Entry {
  lemma: string;
  pos: string;
  pronunciation: string;
  word: string;
}

export const normalizeTokens = (data: Token[], text: string): Token[] => {
    // Flatten the array of arrays
    const flattenedData: Token[] = data.flat();
  
    // Create a map to group entries by their 'word' (text)
    const tokenMap: Map<string, Token> = new Map();
  
    flattenedData.forEach(entry => {
      normalizeToken(entry, tokenMap);
    });
  
    // Convert the map to an array of tokens
    return addSpaceTokens(Array.from(tokenMap.values()), text);
  };
const normalizeToken = (entry: Entry, tokenMap: Map<string, Token>): void => {
  if (!tokenMap.has(entry.word)) {
    tokenMap.set(entry.word, {
      text: entry.word,
      pronunciation: entry.pronunciation,
      lemmas: [],
    });
  }

  const token = tokenMap.get(entry.word)!;
  token.lemmas!.push({
    lemma: entry.lemma,
    pos: entry.pos,
  });

  // Optionally, handle the 'pos' and 'pronunciation' fields
  if (!token.pos) {
    token.pos = entry.pos;
  }

  if (!token.pronunciation) {
    token.pronunciation = entry.pronunciation;
  }
};


export default { normalizeTokens };
