import axios from 'axios';
import Papa from 'papaparse';

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined;

export interface DictionaryEntry {
  id: string;
  hskId?: string; // Make the 'hskId' property optional
  head: string; // Alias to `simplified`
  pronunciation: string; // Alias to `pinyin`
  alternate?: string; // Traditional character
  definitions: string[];
  level: Level;
};


interface RawEntry {
  id?: string;
  hskId?: string;
  hsk: string;
  head?: string; // Alias to `simplified`
  pronunciation?: string; // Alias to `pinyin`
  simplified?: string;
  traditional?: string | undefined; // Make the 'traditional' property optional
  pinyin?: string;
  definitions?: string;
}


export class Dictionary {
  private index: Map<string, DictionaryEntry[]>;
  private entries: Map<string, DictionaryEntry>;
  public loaded: boolean;

  constructor() {
    this.index = new Map();
    this.entries = new Map();
    this.loaded = false;
  }

  private normalizeEntry(entry: RawEntry): DictionaryEntry {
    let level: Level;
    if (["1", "2", "3", "4", "5", "6", "7"].includes(entry.hsk)) {
      level = parseInt(entry.hsk) as Level;
    }
    return {
      id: entry.id || '', // Add a default value for the 'id' property
      hskId: entry.hskId,
      level,
      head: entry.simplified || '',
      pronunciation: entry.pinyin || '',
      alternate: entry.traditional || '',
      definitions: entry.definitions ? entry.definitions.split('/').map(def => def.trim()) : [],
    };
  }

  async loadData() {
    try {
      return
      console.log('Dictionary: Loading data...');
      const response = await axios.get('https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt');
      const parsedData = Papa.parse(response.data, { header: true });
      parsedData.data = parsedData.data.map((entry) => this.normalizeEntry(entry as RawEntry));
      this.entries.clear();
      this.index.clear();
      
      this.buildIndex(parsedData.data as DictionaryEntry[]);
      this.loaded = true;
      console.log('Dictionary: Data loaded.');
    } catch (error) {
      console.error('Failed to load dictionary data:', error);
    }
  }

  private buildIndex(entries: DictionaryEntry[]): void {
    const entryCount: Record<string, number> = {};

    entries.forEach((entry, index) => {
      const baseId = `${entry.alternate},${this.normalizePinyin(entry.pronunciation)}`;
      const count = entryCount[baseId] = (entryCount[baseId] || 0) + 1;
      const uniqueId = `${baseId},${count - 1}`;

      entry.id = uniqueId; // Assign unique ID
      this.entries.set(uniqueId, entry);

      this.addToIndex(entry.head, entry);
      if (entry.alternate) this.addToIndex(entry.alternate, entry);
      this.addToIndex(this.normalizePinyin(entry.pronunciation), entry);
      entry.definitions.forEach(def => this.addToIndex(def, entry));
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

  findWordsInPhrase(phrase: string): DictionaryEntry[] {
    // Find any word with `head` property that `phrase` contains
    const results = new Set<DictionaryEntry>();
    this.entries.forEach(entry => {
      if (phrase.includes(entry.head) || (entry.alternate && phrase.includes(entry.alternate))) {
        results.add(entry);
      }
    });
    return Array.from(results);
  }
}
