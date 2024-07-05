// TranslationManager.ts

import { translateText, translateTextArray } from '@/src/api/python/translate';

interface TranslationCache {
  [key: string]: {
    [text: string]: string;
  };
}

interface TranslationArrayCache {
  [key: string]: {
    [key: string]: string[];
  };
}

class TranslationManager {
  private static instance: TranslationManager;
  private cache: TranslationCache = {};
  private arrayCache: TranslationArrayCache = {};
  private pendingTranslations: Map<string, Promise<string>> = new Map();
  private pendingArrayTranslations: Map<string, Promise<string[]>> = new Map();

  private constructor() {}

  public static getInstance(): TranslationManager {
    if (!TranslationManager.instance) {
      TranslationManager.instance = new TranslationManager();
    }
    return TranslationManager.instance;
  }

  private getCacheKey(sourceText: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}-${targetLang}:${sourceText}`;
  }

  private getArrayCacheKey(sourceTexts: string[], sourceLang: string, targetLang: string): string {
    return `${sourceLang}-${targetLang}:${sourceTexts.join('|')}`;
  }

  public async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    const cacheKey = this.getCacheKey(text, sourceLang, targetLang);

    // Check if the translation is already in cache
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    // Check if there's a pending translation for this text
    if (this.pendingTranslations.has(cacheKey)) {
      return this.pendingTranslations.get(cacheKey)!;
    }

    // If not, create a new translation promise
    const translationPromise = translateText(text, sourceLang, targetLang).then(
      (translatedText) => {
        this.cache[cacheKey] = translatedText;
        this.pendingTranslations.delete(cacheKey);
        return translatedText;
      }
    );

    // Store the pending translation
    this.pendingTranslations.set(cacheKey, translationPromise);

    return translationPromise;
  }

  public async translateArray(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    const cacheKey = this.getArrayCacheKey(texts, sourceLang, targetLang);

    // Check if the translation array is already in cache
    if (this.arrayCache[cacheKey]) {
      return this.arrayCache[cacheKey];
    }

    // Check if there's a pending translation for this array
    if (this.pendingArrayTranslations.has(cacheKey)) {
      return this.pendingArrayTranslations.get(cacheKey)!;
    }

    // If not, create a new translation promise
    const translationPromise = translateTextArray(texts, sourceLang, targetLang).then(
      (translatedTexts) => {
        this.arrayCache[cacheKey] = translatedTexts;
        this.pendingArrayTranslations.delete(cacheKey);
        return translatedTexts;
      }
    );

    // Store the pending translation
    this.pendingArrayTranslations.set(cacheKey, translationPromise);

    return translationPromise;
  }
}

export default TranslationManager.getInstance();