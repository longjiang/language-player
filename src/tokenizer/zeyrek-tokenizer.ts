import { addSpaceTokens } from './tokenizer-utils';
import { Token, Lemma } from '@/types/tokenTypes';

interface RawEntry {
  lemma: string;
  morphemes: string[];
  pos: string;
  word: string;
}

export const normalizeTokens = (data: RawEntry[][], text: string): Token[] => {
  // Flatten the array of arrays
  const flattenedData: RawEntry[] = data.flat();

  // Create a map to group entries by their 'word' (text)
  const tokenMap: Map<string, Token> = new Map();

  flattenedData.forEach(entry => {
    normalizeToken(entry, tokenMap);
  });

  // Convert the map to an array of tokens
  return addSpaceTokens(Array.from(tokenMap.values()), text);
};

const normalizeToken = (entry: RawEntry, tokenMap: Map<string, Token>): void => {
  if (!tokenMap.has(entry.word)) {
    tokenMap.set(entry.word, {
      text: entry.word,
      lemmas: [],
    });
  }

  const token = tokenMap.get(entry.word)!;
  
  // Check if a lemma with the same 'lemma' and 'pos' already exists
  let existingLemma = token.lemmas!.find(l => l.lemma === entry.lemma && l.pos === entry.pos);
  
  if (existingLemma) {
    // If it exists, add the morphemes to the existing lemma's morphologies
    if (!existingLemma.morphologies) {
      existingLemma.morphologies = [];
    }
    existingLemma.morphologies.push(...entry.morphemes);
  } else {
    // If it doesn't exist, create a new lemma
    const newLemma: Lemma = {
      lemma: entry.lemma,
      pos: entry.pos,
      morphologies: entry.morphemes,
    };
    token.lemmas!.push(newLemma);
  }

  // Set the token's pos if it's not set yet
  if (!token.pos) {
    token.pos = entry.pos;
  }

  // Set the token's stem if it's not set yet (using the first lemma)
  if (!token.stem && token.lemmas!.length > 0) {
    token.stem = token.lemmas![0].lemma;
  }
};

export default { normalizeTokens };