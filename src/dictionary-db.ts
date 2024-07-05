// @/src/dictionary-db.ts

import * as SQLite from 'expo-sqlite';
import { stripAccents } from '@/src/utils';

export const escapeSQLValue = (value: string): string => {
  if (value === null || value === undefined) {
    return null;
  }
  return `${value.replace(/'/g, "''")}`; // Single quote escaping
}

export class DictionaryDB {
  public db: SQLite.SQLiteDatabase | null = null;
  private dbName: string;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  async openDB(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(`${this.dbName}.db`);
  }

  async loaded(): Promise<boolean> {
    const result = await this.db!.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM ${this.dbName}`);
    return !!result && result.count > 0;
  }

  async createTable(forceRebuild: boolean): Promise<void> {
    if (forceRebuild) {
      await this.db!.execAsync(`DROP TABLE IF EXISTS ${this.dbName}`);
    }

    await this.db!.execAsync(`
      CREATE TABLE IF NOT EXISTS ${this.dbName} (
        id TEXT PRIMARY KEY,
        hskId INTEGER,
        head TEXT,
        pronunciation TEXT,
        alternate TEXT,
        definitions TEXT,
        level INTEGER,
        search TEXT,
        pos TEXT
      );
    `);
  }

  async insertEntries(entries: any[]): Promise<void> {
    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const values = batch.map(entry => {
        const search = `${entry.head} ${stripAccents(entry.head).toLowerCase()} ${entry.alternate || ''} ${stripAccents(entry.pronunciation || '').toLowerCase().replace(/\s+/g, '')} ${entry.definitions.join(' ').toLowerCase()}`
        return `(${escapeSQLValue(entry.id) ? `'${escapeSQLValue(entry.id)}'` : 'NULL'}, 
                 ${entry.hskId || 'NULL'}, 
                 ${escapeSQLValue(entry.head) ? `'${escapeSQLValue(entry.head)}'` : 'NULL'}, 
                 ${escapeSQLValue(entry.pronunciation) ? `'${escapeSQLValue(entry.pronunciation)}'` : 'NULL'}, 
                 ${escapeSQLValue(entry.alternate) ? `'${escapeSQLValue(entry.alternate)}'` : 'NULL'}, 
                 ${escapeSQLValue(entry.definitions.join(' | ')) ? `'${escapeSQLValue(entry.definitions.join(' | '))}'` : 'NULL'}, 
                 ${entry.level || 'NULL'}, 
                 ${escapeSQLValue(search) ? `'${escapeSQLValue(search)}'` : 'NULL'}, 
                 ${escapeSQLValue(entry.pos) ? `'${escapeSQLValue(entry.pos)}'` : 'NULL'})`;
      }).join(',');
  
      await this.db!.execAsync(`INSERT OR IGNORE INTO ${this.dbName} (id, hskId, head, pronunciation, alternate, definitions, level, search, pos) VALUES ${values}`);
    }
  }

  async createIndexes(): Promise<void> {
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_search ON ${this.dbName}(search)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_hskId ON ${this.dbName}(hskId)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_head ON ${this.dbName}(head)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_pronunciation ON ${this.dbName}(pronunciation)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_alternate ON ${this.dbName}(alternate)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_definitions ON ${this.dbName}(definitions)`);
  }

  async get(id: string): Promise<any> {
    return await this.db!.getFirstAsync(`SELECT * FROM ${this.dbName} WHERE id = ?`, [id]).catch((err) => { console.log(err) });
  }

  async getWordList(): Promise<string[]> {
    return await this.db!.getAllAsync(`SELECT DISTINCT head FROM ${this.dbName}`).then((results) => results.map((r: any) => r.head));
  }

  async search(query: string): Promise<any[]> {
    return await this.db!.getAllAsync(`SELECT * FROM ${this.dbName} WHERE search LIKE ?`, [`%${query}%`]);
  }

  // match any records where the `field` contains any part of the input `phrase`
  async fieldContainsPhrase(field: string, phrase: string): Promise<any[]> {
    return await this.db!.getAllAsync(
      `SELECT * FROM ${this.dbName} WHERE ? LIKE '%' ||${field} || '%' AND ${field} <> '%'`,
      [phrase]
    );
  }  

  // Helper method to escape identifiers (table names, column names)
  async fieldsContainPhrase(fields: string[], phrase: string): Promise<any[]> {
    if (fields.length === 0) {
      throw new Error("At least one field must be specified");
    }

    const escapedFields = fields.map(field => this.escapeIdentifier(field));
    const conditions = escapedFields.map(field => `${field} LIKE ?`).join(' OR ');
    const params = Array(fields.length).fill(`%${escapeSQLValue(phrase)}%`);

    const query = `SELECT * FROM ${this.escapeIdentifier(this.dbName)} WHERE ${conditions}`;
    
    return await this.db!.getAllAsync(query, params);
  }
  // match any records where the input `phrase` contains any part of the specified `field`
  async phraseContainsField(phrase: string, field: string): Promise<any[]> {
    const escapedField = this.escapeIdentifier(field);
    const escapedPhrase = escapeSQLValue(phrase);
    
    const query = `SELECT * FROM ${this.escapeIdentifier(this.dbName)} 
                   WHERE instr(?, ${escapedField}) > 0 
                   AND ${escapedField} <> ''
                   LIMIT 100`; // Add a LIMIT to ensure the query doesn't run indefinitely
    
    return await this.db!.getAllAsync(query, [escapedPhrase]);
  }

  // match any records where the input `phrase` contains any part of any of the specified `fields`
  async phraseContainsFields(phrase: string, fields: string[]): Promise<any[]> {
    if (fields.length === 0) {
      throw new Error("At least one field must be specified");
    }

    const escapedFields = fields.map(field => this.escapeIdentifier(field));
    const escapedPhrase = escapeSQLValue(phrase);
    
    const conditions = escapedFields.map(field => `instr(?, ${field}) > 0 AND ${field} <> ''`).join(' OR ');
    
    const query = `SELECT * FROM ${this.escapeIdentifier(this.dbName)} 
                   WHERE ${conditions}
                   LIMIT 100`; // Add a LIMIT to ensure the query doesn't run indefinitely
    
    const params = Array(fields.length).fill(escapedPhrase);
    
    return await this.db!.getAllAsync(query, params);
  }

  // Helper method to escape identifiers (table names, column names)
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

}
