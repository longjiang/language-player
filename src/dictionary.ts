// @/src/dictionary
import * as SQLite from 'expo-sqlite';
import axios from 'axios';
import Papa from 'papaparse';

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined;

export interface DictionaryEntry {
  id: string; // HSK CEDICT's IDs take the form of "traditional,pinyin,index" e.g. "中國,zhōng_guó,0"
  hskId?: number;
  head: string;
  pronunciation: string;
  alternate?: string;
  definitions: string[];
  level: Level;
};

interface RawEntry {
  id?: string;
  hskId?: string;
  hsk: string;
  head?: string;
  pronunciation?: string;
  simplified?: string;
  traditional?: string | undefined;
  pinyin?: string;
  definitions?: string;
}

export class Dictionary {
  private db: SQLite.SQLiteDatabase | null = null;

  async openDB(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync('hsk_cedict.db');
  }

  async loadData(forceRebuild: boolean = false): Promise<void> {
    await this.openDB();
    if (forceRebuild) {
      await this.db!.execAsync('DROP TABLE IF EXISTS hsk_cedict');
    }
    
    await this.db!.execAsync(`
      CREATE TABLE IF NOT EXISTS hsk_cedict (
        id TEXT PRIMARY KEY,
        hskId INTEGER,
        head TEXT,
        pronunciation TEXT,
        alternate TEXT,
        definitions TEXT,
        level INTEGER,
        search TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_search ON hsk_cedict(search);
      CREATE INDEX IF NOT EXISTS idx_hskId ON hsk_cedict(hskId);
      CREATE INDEX IF NOT EXISTS idx_head ON hsk_cedict(head);
      CREATE INDEX IF NOT EXISTS idx_pronunciation ON hsk_cedict(pronunciation);
      CREATE INDEX IF NOT EXISTS idx_alternate ON hsk_cedict(alternate);
      CREATE INDEX IF NOT EXISTS idx_definitions ON hsk_cedict(definitions);
    `);

    const countResult = await this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM hsk_cedict');
    if (countResult && countResult.count > 0) {
      console.log('Database already loaded.');
      return;
    }

    const response = await axios.get('https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt');
    const parsedData = Papa.parse(response.data, { header: true });
    const entryCount: Record<string, number> = {};
    const entries = parsedData.data.map(entry => this.normalizeEntry(entry as RawEntry, entryCount));

    for (const entry of entries) {
      await this.db!.runAsync('INSERT INTO hsk_cedict (id, hskId, head, pronunciation, alternate, definitions, level, search) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          entry.id,
          entry.hskId ?? null, // Provide a fallback value of null if entry.hskId is undefined
          entry.head,
          entry.pronunciation,
          entry.alternate ?? null, // Provide a fallback value of null if entry.alternate is undefined
          entry.definitions.join(' | '),
          entry.level ?? null, // Provide a fallback value of null if entry.level is undefined
          `${entry.head} ${entry.alternate || ''} ${this.stripAccents(entry.pronunciation.toLowerCase()).replace(/\s+/g, '')} ${entry.definitions.join(' ')}`
        ]
      );
    }

    console.log('Data loaded and normalized.');
  }

  private normalizeEntry(entry: RawEntry, entryCount: Record<string, number>): DictionaryEntry {
    const level: Level = parseInt(entry.hsk) as Level || undefined;
    const definitionsArray = entry.definitions ? entry.definitions.split('/').map(def => def.trim()) : [];
    return {
      id: this.generateUniqueId(entry, entryCount),
      hskId: entry.hskId ? parseInt(entry.hskId) : undefined,
      head: entry.simplified || '',
      pronunciation: entry.pinyin || '',
      alternate: entry.traditional,
      definitions: definitionsArray,
      level
    };
  }

  private generateUniqueId(entry: RawEntry, entryCount: Record<string, number>): string {
    const baseId = `${entry.traditional},${(entry.pinyin || '').replace(/\s+/g, '_')}`;
    const count = entryCount[baseId] = (entryCount[baseId] || 0) + 1;
    return `${baseId},${count - 1}`;
  }
  
  private sortEntries(entries: DictionaryEntry[], query: string): DictionaryEntry[] {
    const exactMatches = entries.filter(entry => entry.head === query || entry.alternate === query);
    const otherMatches = entries
      .filter(entry => entry.head !== query && entry.alternate !== query)
      .sort((a, b) => a.head.length - b.head.length);
    return [...exactMatches, ...otherMatches];
  }

  private stripAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  
  async search(query: string): Promise<DictionaryEntry[]> {
    console.log('Dictionary class - search. Searching for:', query);
    query = this.stripAccents(query.toLowerCase()).replace(/\s+/g, ' ');
    const results = await this.db!.getAllAsync('SELECT * FROM hsk_cedict WHERE search LIKE ?', [`%${query}%`]);
    console.log('Dictionary class - search', results.length);
  
    const entries = results.map(this.transformToDictionaryEntry);
    return this.sortEntries(entries, query);
  }

  async getEntry(id: string): Promise<DictionaryEntry | undefined> {
    const result = await this.db!.getFirstAsync('SELECT * FROM hsk_cedict WHERE id = ?', [id]);
    return result ? this.transformToDictionaryEntry(result) : undefined;
  }

  async findWordsInPhrase(phrase: string): Promise<DictionaryEntry[]> {
    const words = phrase.toLowerCase().split(/\s+/);
    const results = new Set<DictionaryEntry>();

    for (const word of words) {
      const matches = await this.db!.getAllAsync('SELECT * FROM hsk_cedict WHERE search LIKE ?', [`%${word}%`]);
      matches.forEach(match => results.add(this.transformToDictionaryEntry(match)));
    }

    return Array.from(results);
  }

  private transformToDictionaryEntry(entry: any): DictionaryEntry {
    return {
      id: entry.id,
      hskId: entry.hskId ? parseInt(entry.hskId) : undefined,
      head: entry.head,
      pronunciation: entry.pronunciation,
      alternate: entry.alternate,
      definitions: entry.definitions.split(' | '),
      level: entry.level as Level
    };
  }
}
