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
  module: TokenizerModule,
  endPoint: string;
  languages: string[];
}

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

  public logCache(): void {
    const cacheObject = {};
    this.cache.forEach((value, key) => {
      cacheObject[key] = value;
    });
    console.log("Cache as Object:", cacheObject);
  }

  public loadCache(initialCache: { [key: string]: Token[] }): void {
    for (const [key, tokens] of Object.entries(initialCache)) {
      this.cache.set(key, tokens);
    }
    console.log("🍒 Cache loaded");
  }

  private generateCacheKey(text: string): string {
    const hash = CryptoJS.MD5(text).toString();
    return hash;
  }

  public async fetchTokens(tokenizer: Tokenizer, text: string, l2Lang: Language): Promise<Token[]> {
    const uri = `${PYTHON_SERVER}/${tokenizer.endPoint}?text=${encodeURIComponent(text)}&lang=${l2Lang.iso639_3}`;
    const response = await fetch(uri);
    const tokenData = await response.json();

    return tokenizer.module.normalizeTokens(tokenData, text);
  }

  public async tokenize(text: string, l2Lang: Language): Promise<Token[] | undefined> {
    const cacheKey = this.generateCacheKey(text);
    if (this.cache.has(cacheKey)) {
      console.log("🍎 Loading from cache:", cacheKey);
      return this.cache.get(cacheKey);
    }

    try {
      let tokens: Token[] | undefined = undefined;
      const remoteTokenizer = getTokenizer(l2Lang.code);
      if (remoteTokenizer) {
        console.log("🍌 Fetching from remote tokenizer:", cacheKey);
        tokens = await this.fetchTokens(remoteTokenizer, text, l2Lang);
      } else {
        console.log("🍊 Tokenizing locally:", cacheKey);
        tokens = await this.localTokenizer.tokenize(text, l2Lang);
      }

      // Cache the results
      this.cache.set(cacheKey, tokens || []);
      console.log("🍓 Caching result:", cacheKey);
      return tokens;
    } catch (error) {
      console.error("Error fetching tokens:", error);
    }
  }
}