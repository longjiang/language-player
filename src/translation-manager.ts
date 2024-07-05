// TranslationManager.ts

import { translateText, translateTextArray } from '@/src/api/python/translate';

export const LANGS_WITH_AZURE_TRANSLATE = 'af am ar as az ba bg bn bo bs ca cs cy da de dsb dv el en es et eu fa fi fil fj fo fr ga gl gom gu ha he hi hr hsb ht hu hy id ig ikt is it iu ja ka kk km kmr kn ko ku ky ln lo lt lug lv lzh mai mg mi mk ml mn mr ms mt mww my no nb ne nl nso nya or otq pa pl prs ps pt ro ru run rw sd si sk sl sm sn so sq sr st sv sw ta te th ti tk tlh tn to tr tt ty ug uk ur uz vi xh yo yua yue zh zu'.split(' ');

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

  private handleInitialDashes(text: string): [string, string] {
    let initialDashes = '';
    const dashMatch = text.match(/^(-+)/);
    if (dashMatch) {
      initialDashes = dashMatch[0];
      text = text.substring(initialDashes.length);
    }
    return [initialDashes, text];
  }

  private isLanguageSupported(langCode: string): boolean {
    return LANGS_WITH_AZURE_TRANSLATE.includes(langCode);
  }

  public async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!this.isLanguageSupported(targetLang)) {
      console.error(`Azure Translator does not support language code '${targetLang}'.`);
      return 'Language not supported';
    }

    const [initialDashes, strippedText] = this.handleInitialDashes(text);
    const cacheKey = this.getCacheKey(strippedText, sourceLang, targetLang);

    // Check if the translation is already in cache
    if (this.cache[cacheKey]) {
      return initialDashes + this.cache[cacheKey];
    }

    // Check if there's a pending translation for this text
    if (this.pendingTranslations.has(cacheKey)) {
      const result = await this.pendingTranslations.get(cacheKey)!;
      return initialDashes + result;
    }

    // If not, create a new translation promise
    const translationPromise = translateText(strippedText, sourceLang, targetLang).then(
      (translatedText) => {
        this.cache[cacheKey] = translatedText;
        this.pendingTranslations.delete(cacheKey);
        return translatedText;
      }
    ).catch((error) => {
      console.error('Translation failed:', error);
      return 'Translation error';
    });

    // Store the pending translation
    this.pendingTranslations.set(cacheKey, translationPromise);

    const result = await translationPromise;
    return initialDashes + result;
  }

  public async translateArray(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    if (!this.isLanguageSupported(targetLang)) {
      console.error(`Azure Translator does not support language code '${targetLang}'.`);
      return texts.map(() => 'Language not supported');
    }

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
        // Reattach initial dashes if any
        const finalTranslatedTexts = translatedTexts.map((translatedText, index) => {
          const [initialDashes] = this.handleInitialDashes(texts[index]);
          return initialDashes + translatedText;
        });
        this.arrayCache[cacheKey] = finalTranslatedTexts;
        this.pendingArrayTranslations.delete(cacheKey);
        return finalTranslatedTexts;
      }
    ).catch((error) => {
      console.error('Translation failed:', error);
      return texts.map(() => 'Translation error');
    });

    // Store the pending translation
    this.pendingArrayTranslations.set(cacheKey, translationPromise);

    return translationPromise;
  }
}

export default TranslationManager.getInstance();