// @/src/tokenizer/index.ts

import { PYTHON_SERVER } from "@/src/api/python"
import { Language } from '@/src/languages';
import LocalTokenizer from './local-tokenizer';
import { tokenizers } from './tokenizer-list';
import CryptoJS from 'crypto-js';

export interface Lemma {
  lemma: string;
  pos?: string;
  morphologies?: string[];
}

export interface Token {
  text: string;
  pos?: string;
  stem?: string;
  lemmas?: Lemma[];
  pronunciation?: string;
}

export interface TokenizerModule {
  normalizeTokens: (tokens: Token[], text: string) => Token[];
}

export interface Tokenizer {
  name: string;
  module: TokenizerModule,
  endPoint: string;
  languages: string[];
}

interface CacheEntry {
  rawTokens: Token[];
  originalText: string;
}

export const getTokenizer = (languageCode: string): Tokenizer | null => {
  for (let tokenizer of tokenizers) {
    if (tokenizer.languages.includes(languageCode)) {
      return tokenizer;
    }
  }
  return null;
}


export const addSpaceTokens = (tokens: Token[]): Token[] => {
  let newTokens: Token[] = [];
  let prevWasPunctuation = false;
  let insideQuote = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token.text;

    if (word === '"' || word === "'") {
      if (insideQuote) {
        newTokens.push(token);
        insideQuote = false;
      } else {
        if (newTokens.length > 0 && !prevWasPunctuation) {
          newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
        }
        newTokens.push(token);
        insideQuote = true;
      }
      prevWasPunctuation = true;
    } else if (word === "," || word === "." || word === ":" || word === ";") {
      newTokens.push(token);
      prevWasPunctuation = true;
    } else {
      if (newTokens.length > 0 && !prevWasPunctuation && !insideQuote) {
        newTokens.push({ text: " ", pos: undefined, lemmas: [], pronunciation: undefined });
      }
      newTokens.push(token);
      prevWasPunctuation = false;
    }
  }

  return newTokens;
}

export class TokenizerService {
  private static instance: TokenizerService;
  private cache: Map<string, CacheEntry>;
  private localTokenizer: LocalTokenizer;

  private constructor(wordset?: Set<string>) {
    this.cache = new Map<string, CacheEntry>();
    this.localTokenizer = new LocalTokenizer(wordset);
  }

  public static getInstance(wordset?: Set<string>): TokenizerService {
    if (!TokenizerService.instance) {
      TokenizerService.instance = new TokenizerService(wordset);
    }
    return TokenizerService.instance;
  }

  public loadCache(initialCache: { [key: string]: Token[] }): void {
    for (const [key, tokenData] of Object.entries(initialCache)) {
      const text = tokenData.map(token => token.text).join(" ");
      this.cache.set(key, { rawTokens: tokenData, originalText: text });
    }
  }

  private generateCacheKey(text: string): string {
    const hash = CryptoJS.MD5(text).toString();
    return hash;
  }

  public async fetchTokens(tokenizer: Tokenizer, text: string, l2Lang: Language): Promise<Token[]> {
    const uri = `${PYTHON_SERVER}/${tokenizer.endPoint}?text=${encodeURIComponent(text)}&lang=${l2Lang.iso639_3}`;
    const response = await fetch(uri);
    const tokenData = await response.json();
    return tokenData;
  }

  public async tokenize(text: string, l2Lang: Language): Promise<Token[] | undefined> {
    const cacheKey = this.generateCacheKey(text);
    const remoteTokenizer = getTokenizer(l2Lang.code);

    if (this.cache.has(cacheKey)) {
      const cacheEntry = this.cache.get(cacheKey)!;
      return remoteTokenizer
        ? remoteTokenizer.module.normalizeTokens(cacheEntry.rawTokens, cacheEntry.originalText)
        : cacheEntry.rawTokens;
    }

    try {
      let rawTokens: Token[] | undefined = undefined;
      if (remoteTokenizer) {
        rawTokens = await this.fetchTokens(remoteTokenizer, text, l2Lang);
      } else {
        rawTokens = await this.localTokenizer.tokenize(text, l2Lang);
      }

      if (!rawTokens || rawTokens.length === 0) {
        console.error("Tokenization returned empty result");
        rawTokens = [{ text }];
      }

      // Cache the raw results
      this.cache.set(cacheKey, { rawTokens, originalText: text });

      // Return normalized tokens
      return remoteTokenizer
        ? remoteTokenizer.module.normalizeTokens(rawTokens, text)
        : rawTokens;
    } catch (error) {
      console.error("Error fetching tokens:", error);
      return [{ text }];
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }
}