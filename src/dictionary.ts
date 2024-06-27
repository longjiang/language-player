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

  private escapeSQLValue(value: string) {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return `'${value.replace(/'/g, "''")}'`; // Single quote escaping
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
    `);

    // If there are records, return
    const countResult = await this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM hsk_cedict');
    if (countResult && countResult.count > 0) {
      console.log('Dictionary: Database already loaded.');
      return;
    }
    
    console.log('Dictionary: Fetching...')
    const response = await axios.get('https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt');
    
    console.log('Dictionary: Parsing...')
    const parsedData = Papa.parse(response.data, { header: true });
    
    const entryCount: Record<string, number> = {};
    const entries = parsedData.data.map(entry => this.normalizeEntry(entry as RawEntry, entryCount));

    console.log('Dictionary: Inserting records...')
    // Inserting records in batches
    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const values = batch.map(entry => {
        const search = `${entry.head} ${entry.alternate || ''} ${this.stripAccents(entry.pronunciation).toLowerCase().replace(/\s+/g, '')} ${entry.definitions.join(' ').toLowerCase()}`
        return `(${this.escapeSQLValue(entry.id)}, ${entry.hskId || 'NULL'}, ${this.escapeSQLValue(entry.head)}, ${this.escapeSQLValue(entry.pronunciation)}, ${this.escapeSQLValue(entry.alternate || '')}, ${this.escapeSQLValue(entry.definitions.join(' | '))}, ${entry.level || 'NULL'}, ${this.escapeSQLValue(search)})`
      }).join(',');

      await this.db!.execAsync(`INSERT INTO hsk_cedict (id, hskId, head, pronunciation, alternate, definitions, level, search) VALUES ${values}`);
    }

    // After the loop that inserts the records
    const newCountResult = await this.db!.getAllSync('SELECT COUNT(*) AS count FROM hsk_cedict');
    console.log(`Dictionary: ${newCountResult.count} entries inserted.`);

    // Give a preview of the first few records
    const preview = await this.db!.getAllAsync('SELECT * FROM hsk_cedict LIMIT 5');
    console.log('Dictionary: Preview of the first 5 records:', preview);

    // Create indices after all data has been inserted
    await this.db!.execAsync('CREATE INDEX IF NOT EXISTS idx_search ON hsk_cedict(search)');
    await this.db!.execAsync('CREATE INDEX IF NOT EXISTS idx_hskId ON hsk_cedict(hskId)');
    await this.db!.execAsync('CREATE INDEX IF NOT EXISTS idx_head ON hsk_cedict(head)');
    await this.db!.execAsync('CREATE INDEX IF NOT EXISTS idx_pronunciation ON hsk_cedict(pronunciation)');
    await this.db!.execAsync('CREATE INDEX IF NOT EXISTS idx_alternate ON hsk_cedict(alternate)');
    await this.db!.execAsync('CREATE INDEX IF NOT EXISTS idx_definitions ON hsk_cedict(definitions)');

    console.log('Dictionary: Data loaded and normalized.');
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
    .sort((a, b) => {
      // Prioritize entries with a 'level' value
      if (a.level && b.level) {
        return a.level - b.level; // Ascending order by 'level'
      } else if (a.level) {
        return -1; // Entries with a 'level' come first
      } else if (b.level) {
        return 1; // Entries without a 'level' come after
      }

      // Fallback to original sorting criteria if 'level' is the same or not present
      return a.head.length - b.head.length;
    });
  return [...exactMatches, ...otherMatches];
}

  private stripAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  
  async search(query: string): Promise<DictionaryEntry[]> {
    query = this.stripAccents(query.toLowerCase()).replace(/\s+/g, ' ');
    const results = await this.db!.getAllAsync('SELECT * FROM hsk_cedict WHERE search LIKE ?', [`%${query}%`]);
  
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
