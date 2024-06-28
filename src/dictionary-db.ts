// @/src/dictionary-db.ts

import * as SQLite from 'expo-sqlite';
import { stripAccents } from '@/src/utils';

export class DictionaryDB {
  private db: SQLite.SQLiteDatabase | null = null;
  private dbName: string;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  async openDB(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(`${this.dbName}.db`);
  }

  escapeSQLValue(value: string): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return `'${value.replace(/'/g, "''")}'`; // Single quote escaping
  }

  async execAsync(query: string): Promise<any> {
    if (!this.db) throw new Error('Database not opened');
    return new Promise((resolve, reject) => this.db!.execAsync(query).then(resolve).catch(reject));
  }

  async getFirstAsync<T>(query: string): Promise<T | undefined> {
    return await this.db!.getFirstAsync(query) || undefined;
  }

  async getAllAsync<T>(query: string): Promise<T[]> {
    const results = await this.db!.getAllAsync(query);
    return results;
  }

  async loaded(): Promise<boolean> {
    const result = await this.db!.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM ${this.dbName}`);
    return !!result && result.count > 0;
  }

  async createTable(forceRebuild: boolean): Promise<void> {
    if (forceRebuild) {
      await this.execAsync(`DROP TABLE IF EXISTS ${this.dbName}`);
    }

    await this.execAsync(`
      CREATE TABLE IF NOT EXISTS ${this.dbName} (
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
  }

  async insertEntries(entries: any[]): Promise<void> {
    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const values = batch.map(entry => {
        const search = `${entry.head} ${entry.alternate || ''} ${stripAccents(entry.pronunciation).toLowerCase().replace(/\s+/g, '')} ${entry.definitions.join(' ').toLowerCase()}`
        return `(${this.escapeSQLValue(entry.id)}, ${entry.hskId || 'NULL'}, ${this.escapeSQLValue(entry.head)}, ${this.escapeSQLValue(entry.pronunciation)}, ${this.escapeSQLValue(entry.alternate || '')}, ${this.escapeSQLValue(entry.definitions.join(' | '))}, ${entry.level || 'NULL'}, ${this.escapeSQLValue(search)})`
      }).join(',');

      await this.execAsync(`INSERT INTO ${this.dbName} (id, hskId, head, pronunciation, alternate, definitions, level, search) VALUES ${values}`);
    }
  }

  async createIndexes(): Promise<void> {
    await this.execAsync(`CREATE INDEX IF NOT EXISTS idx_search ON ${this.dbName}(search)`);
    await this.execAsync(`CREATE INDEX IF NOT EXISTS idx_hskId ON ${this.dbName}(hskId)`);
    await this.execAsync(`CREATE INDEX IF NOT EXISTS idx_head ON ${this.dbName}(head)`);
    await this.execAsync(`CREATE INDEX IF NOT EXISTS idx_pronunciation ON ${this.dbName}(pronunciation)`);
    await this.execAsync(`CREATE INDEX IF NOT EXISTS idx_alternate ON ${this.dbName}(alternate)`);
    await this.execAsync(`CREATE INDEX IF NOT EXISTS idx_definitions ON ${this.dbName}(definitions)`);
  }
}
