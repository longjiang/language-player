declare module 'snowball-stemmers' {
  interface StemmerInstance {
    stem(word: string): string;
  }

  /**
   * Create a new stemmer for the given language.
   * @param lng — lowercase English language name (e.g., 'english', 'german', 'french')
   */
  export function newStemmer(lng: string): StemmerInstance;

  /**
   * List of all supported language identifiers.
   */
  export function algorithms(): string[];
}
