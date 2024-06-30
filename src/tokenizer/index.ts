// @/src/tokenizer.ts
import { PYTHON_SERVER } from "@/src/api/python"
import OpenKoreanTextTokenizer from './openkoreantext-tokenizer';
import JiebaTokenizer from './jieba-tokenizer';
import Pymorphy2Tokenizer from './pymorphy2-tokenizer';
import MeCabTokenizer from './mecab-tokenizer';
import HazmTokenizer from './hazm-tokenizer';
import Zeyrek from './zeyrek-tokenizer';
import Qalsadi from './qalsadi-tokenizer';
import SpacyTokenizer from './spacy-tokenizer';
import SimplemmaTokenizer from './simplemma-tokenizer';
import LemmatizationListTokenizer from './lemmatizationlist-tokenizer';
import PyidaungsuTokenizer from './pyidaungsu-tokenizer';

export interface Lemma {
  lemma: string;
  pos: string;
}

export interface Token {
  text: string;
  pos: string;
  stem?: string;
  lemmas?: Lemma[];
  pronunciation?: string;
}

interface TokenizerModule {
  normalizeTokens: (tokens: Token[], text: string) => (string | Token)[];
}

interface Tokenizer {
  module: TokenizerModule,
  endPoint: string;
  languages: string[];
}

export const tokenizers: Tokenizer[] = [
  {
    module: OpenKoreanTextTokenizer,
    endPoint: 'lemmatize-korean',
    languages: ['ko'],
  },
  {
    module: JiebaTokenizer,
    endPoint: 'lemmatize-chinese',
    languages: ['zh'],
  },
  {
    module: Pymorphy2Tokenizer,
    endPoint: 'lemmatize-russian',
    languages: ['ru'],
  },
  {
    module: PyidaungsuTokenizer,
    endPoint: 'lemmatize-burmese',
    languages: ['my'],
  },
  {
    module: MeCabTokenizer,
    endPoint: 'lemmatize-japanese',
    languages: ['ja'],
  },
  {
    module: HazmTokenizer,
    endPoint: 'lemmatize-persian',
    languages: ['fa'],
  },
  {
    module: Zeyrek,
    endPoint: 'lemmatize-turkish',
    languages: ['tr'],
  },
  {
    module: Qalsadi,
    endPoint: 'lemmatize-arabic',
    languages: ['ar'],
  },
  {
    module: SpacyTokenizer,
    endPoint: 'lemmatize-spacy',
    languages: ['es'],
  },
  {
    module: SimplemmaTokenizer,
    endPoint: 'lemmatize-simple',
    languages: ['ast', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'enm', 'et', 'fi', 'gd', 'ga', 'gl', 'gv', 'sh', 'hu', 'hy', 'id', 'is', 'it', 'ka', 'la', 'lv', 'lt', 'lb', 'mk', 'ms', 'nl', 'nn', 'no', 'nb', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'se', 'es', 'sq', 'sw', 'sv', 'tl', 'tr', 'uk'],
  },
  {
    module: LemmatizationListTokenizer,
    endPoint: 'lemmatization-lists',
    languages: ['ast', 'bg', 'ca', 'cs', 'cy', 'de', 'en', 'et', 'fa', 'fr', 'gd', 'ga', 'gl', 'gv', 'hu', 'it', 'pt', 'ro', 'ru', 'sk', 'sl', 'es', 'sv', 'uk'],
  },
]

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

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): TokenizerService {
    if (!TokenizerService.instance) {
      TokenizerService.instance = new TokenizerService();
    }
    return TokenizerService.instance;
  }

  public async tokenize(text: string, l2Code: string): Promise<Token[] | undefined> {
    const cacheKey = `${l2Code}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const tokenizer = getTokenizer(l2Code);
      if (!tokenizer) {
        throw new Error(`No tokenizer found for language code: ${l2Code}`);
      }

      const response = await fetch(`${PYTHON_SERVER}/${tokenizer.endPoint}?text=${encodeURIComponent(text)}`);
      const tokenData = await response.json();

      const tokens = OpenKoreanTextTokenizer.normalizeTokens(tokenData, text);

      // Cache the results
      this.cache.set(cacheKey, tokens);
      return tokens;
    } catch (error) {
      console.error("Error fetching tokens:", error);
    }
  }
}
