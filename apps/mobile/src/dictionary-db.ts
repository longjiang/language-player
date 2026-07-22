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
    const sql = `SELECT COUNT(*) as count FROM ${this.dbName}`
    const result = await this.db!.getFirstAsync<{ count: number }>(sql);
    return !!result && result.count > 0;
  }

  async createTable(forceRebuild: boolean): Promise<void> {
    if (forceRebuild) {
      const sql = `DROP TABLE IF EXISTS ${this.dbName}`
      await this.db!.execAsync(sql);
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


  async insertEntries(entries: any[], indexPronunciation = false): Promise<void> {
    const batchSize = 50;

    // Start an exclusive transaction to ensure no other operations interfere
    await this.db!.withExclusiveTransactionAsync(async () => {
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const values = batch.map(entry => {
          const pronunciationSearchString = indexPronunciation ? stripAccents(entry.pronunciation || '').toLowerCase().replace(/\s+/g, '') : '';
          const search = `${entry.head} ${stripAccents(entry.head).toLowerCase()} ${entry.alternate || ''} ${pronunciationSearchString} ${entry.definitions.slice(0,1).join(' ').toLowerCase()}`
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
    });
  }


  async createIndexes(): Promise<void> {
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_search ON ${this.dbName}(search)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_hskId ON ${this.dbName}(hskId)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_head ON ${this.dbName}(head)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_pronunciation ON ${this.dbName}(pronunciation)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_alternate ON ${this.dbName}(alternate)`);
    await this.db!.execAsync(`CREATE INDEX IF NOT EXISTS idx_definitions ON ${this.dbName}(definitions)`);
  }

  // ── LLM Cache ────────────────────────────────────────────────

  /**
   * Creates the llm_cache table if it doesn't exist.
   * Stores LLM-generated dictionary entries for offline use.
   * Also stores L1-translated definitions from online lookups.
   * Keyed by (text, l1_code, l2_code).
   */
  async createLlmCacheTable(): Promise<void> {
    await this.db!.execAsync(`
      CREATE TABLE IF NOT EXISTS llm_cache (
        text TEXT NOT NULL,
        l1_code TEXT NOT NULL DEFAULT 'en',
        l2_code TEXT NOT NULL,
        entry_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (text, l1_code, l2_code)
      );
    `);
  }

  /**
   * Persists LLM-generated dictionary entries to the llm_cache table.
   * Entries are stored as JSON strings for later retrieval.
   */
  async insertLlmCacheEntries(
    text: string,
    l1Code: string,
    l2Code: string,
    entries: Record<string, unknown>[]
  ): Promise<void> {
    await this.createLlmCacheTable();
    const entryJson = JSON.stringify(entries);
    await this.db!.runAsync(
      `INSERT OR REPLACE INTO llm_cache (text, l1_code, l2_code, entry_json) VALUES (?, ?, ?, ?)`,
      [text, l1Code, l2Code, entryJson]
    );
  }

  /**
   * Retrieves LLM-cached entries for a given text and language pair.
   * Returns null if not found.
   */
  async getLlmCacheEntries(
    text: string,
    l1Code: string,
    l2Code: string
  ): Promise<Record<string, unknown>[] | null> {
    await this.createLlmCacheTable();
    const row = await this.db!.getFirstAsync<{ entry_json: string }>(
      `SELECT entry_json FROM llm_cache WHERE text = ? AND l1_code = ? AND l2_code = ?`,
      [text, l1Code, l2Code]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.entry_json);
    } catch {
      return null;
    }
  }

  async get(id: string): Promise<any> {
    return await this.db!.getFirstAsync(`SELECT * FROM ${this.dbName} WHERE id = ?`, [id]).catch((err) => { console.log(err) });
  }

  async getWordList(): Promise<string[]> {
    return await this.db!.getAllAsync(`SELECT DISTINCT head FROM ${this.dbName}`).then((results) => results.map((r: any) => r.head));
  }




  /**
   * Performs an optimized search on the dictionary database.
   * Results are sorted by presence of level, then by level, then by relevance, and finally by length.
   * Entries without a defined level are treated as having an "infinite" level.
   * @param query - The search query
   * @param limit - The maximum number of results to return
   * @returns An array of matching raw entries
   */
  async search(query: string, limit: number): Promise<any[]> {
    const escapedQuery = escapeSQLValue(query);
    const searchTerms = query.split(/\s+/).map(term => `%${escapeSQLValue(term)}%`);
    const placeholders = searchTerms.map(() => '?').join(' AND search LIKE ');

    const sql = `
      SELECT * FROM ${this.escapeIdentifier(this.dbName)}
      WHERE search LIKE ${placeholders}
      ORDER BY 
        CASE WHEN level IS NULL THEN 1 ELSE 0 END,  -- Entries with level come first
        COALESCE(level, 9999999) ASC,  -- Sort by level, treating NULL as highest level
        CASE 
          WHEN head = ? THEN 1
          WHEN head LIKE ? THEN 2
          WHEN alternate LIKE ? THEN 3
          ELSE 4
        END,
        length(head) ASC
      LIMIT ?
    `;

    const params = [
      ...searchTerms,
      escapedQuery,
      `${escapedQuery}%`,
      `%${escapedQuery}%`,
      limit.toString()
    ];

    return await this.db!.getAllAsync(sql, params);
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


  
  /**
   * Performs an optimized flexible search on specified fields of the dictionary.
   * @param searchTerms - Array of terms to search for
   * @param fields - Array of field names to search in
   * @param options - Additional search options
   * @returns An array of matching raw entries
   */
  async flexibleSearch(
    searchTerms: string[],
    fields: string[],
    options: {
      limit?: number;
      exactMatch?: boolean;
      matchTypes?: Array<'exact' | 'contains'>;
      bidirectional?: boolean;
      priorityWeights?: number[];
    } = {}
  ): Promise<any[]> {
    const {
      limit = 100,
      exactMatch = false
    } = options;

    if (fields.length === 0 || searchTerms.length === 0) {
      throw new Error("At least one field and one search term must be specified");
    }

    const escapedFields = fields.map(field => this.escapeIdentifier(field));
    const escapedTerms = searchTerms.map(term => escapeSQLValue(stripAccents(term.toLowerCase())));

    let conditions: string[] = [];
    let params: string[] = [];

    escapedTerms.forEach((term, index) => {
      escapedFields.forEach(field => {
        if (exactMatch) {
          conditions.push(`${field} = ?`);
        } else {
          conditions.push(`${field} LIKE '%' || ? || '%'`);
        }
        params.push(term);
      });
    });

    const query = `
      SELECT *
      FROM ${this.escapeIdentifier(this.dbName)}
      WHERE ${conditions.join(' OR ')}
      ORDER BY 
        CASE 
          WHEN ${escapedFields.map(field => `${field} IN (${escapedTerms.map(() => '?').join(', ')})`).join(' OR ')} THEN 1
          ELSE 2
        END,
        length(${escapedFields[0]})  -- Assuming the first field is the primary one (e.g., 'head')
      LIMIT ?
    `;

    // Add parameters for the ORDER BY clause
    params.push(...escapedTerms.flatMap(() => escapedTerms));
    params.push(limit.toString());

    return await this.db!.getAllAsync(query, params);
  }


}
