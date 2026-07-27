declare module 'snowball-stemmers' {
  interface StemmerInstance {
    stem(word: string): string;
  }

  interface SnowballExports {
    /**
     * Create a new stemmer for the given language.
     * @param lng — lowercase English language name (e.g., 'english', 'german', 'french')
     */
    newStemmer(lng: string): StemmerInstance;

    /**
     * List of all supported language identifiers.
     */
    algorithms(): string[];
  }

  const Snowball: SnowballExports;
  export default Snowball;
}
