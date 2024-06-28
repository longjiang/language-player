// @/src/dictionary.ts
import axios from 'axios';
import Papa from 'papaparse';
import { DictionaryDB } from '@/src/dictionary-db';
import { getDictionaryProfile } from '@/src/dictionary-profile';
import { stripAccents } from '@/src/utils';
import { DictionaryEntry, RawEntry, Level } from '@/src/dictionary-types';
import { normalizeEntry, sortEntries, transformToDictionaryEntry } from '@/src/dictionary-utils';

export class Dictionary {
  private dictionaryDB: DictionaryDB;
  private dbName: string;
  private l1: string;
  private sourceUrl: string;

  constructor(l2: string) {
    const { dbName, l1, sourceUrl } = getDictionaryProfile(l2);
    this.dbName = dbName;
    this.l1 = l1;
    this.sourceUrl = sourceUrl;
    this.dictionaryDB = new DictionaryDB(this.dbName);
  }

  async loadData(forceRebuild: boolean = false): Promise<void> {
    await this.dictionaryDB.openDB();
    await this.dictionaryDB.createTable(forceRebuild);

    const loaded = await this.dictionaryDB.loaded()

    if (loaded) {
      console.log('Dictionary: Database already loaded.');
      return;
    }

    console.log('Dictionary: Fetching...')
    const response = await axios.get(this.sourceUrl);
    const parsedData = Papa.parse(response.data, { header: true });

    const entryCount: Record<string, number> = {};
    const entries = parsedData.data.map(entry => normalizeEntry(entry as RawEntry, entryCount));

    console.log('Dictionary: Inserting records...')
    await this.dictionaryDB.insertEntries(entries);

    const newCountResult = await this.dictionaryDB.db!.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${this.dbName}`);
    console.log(`Dictionary: ${newCountResult?.count || 0} entries inserted.`);

    const preview = await this.dictionaryDB.db!.getAllAsync<DictionaryEntry>(`SELECT * FROM ${this.dbName} LIMIT 5`);
    console.log('Dictionary: Preview of the first 5 records:', preview);

    await this.dictionaryDB.createIndexes();

    console.log('Dictionary: Data loaded and normalized.');
  }

  async search(query: string): Promise<DictionaryEntry[]> {
    query = stripAccents(query.toLowerCase()).replace(/\s+/g, ' ');
    const results = await this.dictionaryDB.search(query);
  
    const entries = results.map(transformToDictionaryEntry);
    return sortEntries(entries, query);
  }

  async getEntry(id: string): Promise<DictionaryEntry | undefined> {
    const result = await this.dictionaryDB.get(id);
    return result ? transformToDictionaryEntry(result) : undefined;
  }

  async findWordsInPhrase(phrase: string): Promise<DictionaryEntry[]> {
    const words = phrase.toLowerCase().split(/\s+/);
    const results = new Set<DictionaryEntry>();

    for (const word of words) {
      const matches = await this.dictionaryDB.fieldContains('head', word);
      matches.forEach(match => results.add(transformToDictionaryEntry(match)));
    }

    return Array.from(results);
  }
}
