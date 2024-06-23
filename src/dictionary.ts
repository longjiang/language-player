type DictionaryEntry = {
  hskId: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string;
  // additional fields as necessary
};

class Dictionary {
  private index: Map<string, DictionaryEntry[]>;

  constructor(entries: DictionaryEntry[]) {
    this.index = new Map();
    this.buildIndex(entries);
  }

  private buildIndex(entries: DictionaryEntry[]): void {
    entries.forEach(entry => {
      this.addToIndex(entry.simplified, entry);
      this.addToIndex(entry.traditional, entry);
      this.addToIndex(this.normalizePinyin(entry.pinyin), entry);
      this.addToIndex(entry.definitions.toLowerCase(), entry);
    });
  }

  private addToIndex(key: string, entry: DictionaryEntry): void {
    // Split key by spaces to index each word individually
    key.split(/\s+/).forEach(word => {
      if (!this.index.has(word)) {
        this.index.set(word, []);
      }
      this.index.get(word)!.push(entry);
    });
  }

  private normalizePinyin(pinyin: string): string {
    // Remove tone marks and convert to lower case
    return pinyin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
  }

  search(query: string): DictionaryEntry[] {
    query = query.toLowerCase();
    const results = new Set<DictionaryEntry>();
    query.split(/\s+/).forEach(word => {
      if (this.index.has(word)) {
        this.index.get(word)!.forEach(entry => results.add(entry));
      }
    });
    return Array.from(results);
  }
}

export { Dictionary, DictionaryEntry };
