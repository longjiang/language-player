import axios from 'axios';
import Papa from 'papaparse';

type DictionaryEntry = {
  id: string;
  hskId: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string;
};

class Dictionary {
  private index: Map<string, DictionaryEntry[]>;
  private entries: Map<string, DictionaryEntry>;

  constructor() {
    this.index = new Map();
    this.entries = new Map();
  }

  async loadData() {
    try {
      console.log('Dictionary: Loading data...');
      const response = await axios.get('https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt');
      const parsedData = Papa.parse(response.data, { header: true });
      this.entries.clear();
      this.index.clear();
      this.buildIndex(parsedData.data as DictionaryEntry[]);
      console.log('Dictionary: Data loaded.');
    } catch (error) {
      console.error('Failed to load dictionary data:', error);
    }
  }

  private buildIndex(entries: DictionaryEntry[]): void {
    const entryCount: Record<string, number> = {};

    entries.forEach((entry, index) => {
      const baseId = `${entry.traditional},${this.normalizePinyin(entry.pinyin)}`;
      const count = entryCount[baseId] = (entryCount[baseId] || 0) + 1;
      const uniqueId = `${baseId},${count - 1}`;

      entry.id = uniqueId; // Assign unique ID
      this.entries.set(uniqueId, entry);

      this.addToIndex(entry.simplified, entry);
      this.addToIndex(entry.traditional, entry);
      this.addToIndex(this.normalizePinyin(entry.pinyin), entry);
      this.addToIndex(entry.definitions.toLowerCase(), entry);
    });
  }

  private addToIndex(key: string, entry: DictionaryEntry): void {
    key.split(/\s+/).forEach(word => {
      if (!this.index.has(word)) {
        this.index.set(word, []);
      }
      this.index.get(word)!.push(entry);
    });
  }

  private normalizePinyin(pinyin: string): string {
    return pinyin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toLowerCase();
  }

  async search(query: string): Promise<DictionaryEntry[]> {
    // console.log('searching for:', query);
    query = query.toLowerCase();
    const results = new Set<DictionaryEntry>();
    query.split(/\s+/).forEach(word => {
      if (this.index.has(word)) {
        this.index.get(word)!.forEach(entry => results.add(entry));
      }
    });
    // console.log('found results:', Array.from(results));
    return Array.from(results);
  }

  getEntry(id: string): DictionaryEntry | undefined {
    return this.entries.get(id);
  }
}

export { Dictionary, DictionaryEntry };
