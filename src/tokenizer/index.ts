// @/src/tokenizer/index.ts

import { PYTHON_SERVER } from "@/src/api/python"
import { Language } from '@/src/languages';
import LocalTokenizer from './local-tokenizer';
import { tokenizers, languagesWithSpaCyCache } from './tokenizer-list';
import CryptoJS from 'crypto-js';
import { Token, Lemma, TokenizerModule } from '@/types/tokenTypes';
import SpacyTokenizer from './spacy-tokenizer';

export const getTokenizer = (languageCode: string): Tokenizer | null => {
  for (let tokenizer of tokenizers) {
    if (tokenizer.languages.includes(languageCode)) {
      return tokenizer;
    }
  }
  return null;
}

export class TokenizerService {
  private static instance: TokenizerService;
  private cache: Map<string, Token[]>;
  private localTokenizer: LocalTokenizer;

  private constructor(wordset?: Set<string>) {
    this.cache = new Map<string, Token[]>();
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
      this.cache.set(key, tokenData);
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
      let tokenizerForNormalizing = remoteTokenizer?.module

      // For some languages such as French and German, we're not using SpaCy to tokenize due to performance
      // However, they have tokenization cache done in SpaCy, so we need to normalize them as such.
      if (languagesWithSpaCyCache.includes(l2Lang.code)) {
        tokenizerForNormalizing = SpacyTokenizer
      }

      const normalizedTokens = tokenizerForNormalizing
        ? tokenizerForNormalizing.normalizeTokens(cacheEntry, text)
        : cacheEntry;
      return normalizedTokens
    }

    try {
      let rawTokens: Token[] | undefined = undefined;
      if (remoteTokenizer) {
        rawTokens = await this.fetchTokens(remoteTokenizer, text, l2Lang);
        // console.log("Remote tokens:", rawTokens);
      } else {
        rawTokens = await this.localTokenizer.tokenize(text, l2Lang);
      }

      if (!rawTokens || rawTokens.length === 0) {
        console.error("Tokenization returned empty result");
        rawTokens = [{ text }];
      }

      // Cache the raw results
      this.cache.set(cacheKey, rawTokens);

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