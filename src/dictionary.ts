// @/src/dictionary.ts

import axios from 'axios';
import Papa from 'papaparse';
import { DictionaryDB } from '@/src/dictionary-db';
import { getDictionaryProfile } from '@/src/dictionary-profile';
import { stripAccents } from '@/src/utils';
import { DictionaryEntry, RawEntry, Level } from '@/src/dictionary-types';
import { sortEntries, transformToDictionaryEntry } from '@/src/dictionary-utils';
import { Language } from '@/src/languages';

export class Dictionary {
  private dictionaryDB: DictionaryDB;
  private dbName: string;
  private sourceUrl: string;
  private normalizeEntry: (entry: RawEntry, entryCount: Record<string, number>) => DictionaryEntry;

  readonly l1Code: string;

  constructor(l2Lang: Language) {
    const { dbName, l1Code, sourceUrl, normalizeEntry } = getDictionaryProfile(l2Lang);
    this.dbName = dbName;
    this.l1Code = l1Code;
    this.sourceUrl = sourceUrl;
    this.dictionaryDB = new DictionaryDB(this.dbName);
    this.normalizeEntry = normalizeEntry;
  }

  async loadData(forceRebuild: boolean = false, addLog: (message: string) => void): Promise<void> {
    await this.dictionaryDB.openDB();
    await this.dictionaryDB.createTable(forceRebuild);

    const loaded = await this.dictionaryDB.loaded();

    if (loaded) {
      addLog('Database already loaded.');
      return;
    }

    addLog('Downloading...');
    const response = await axios.get(this.sourceUrl);
    const parsedData = Papa.parse(response.data, { header: true });

    const entryCount: Record<string, number> = {};
    const entries = parsedData.data.map(entry => this.normalizeEntry(entry as RawEntry, entryCount)).filter(entry => entry.head);

    addLog('Processing...');
    await this.dictionaryDB.insertEntries(entries);

    const newCountResult = await this.dictionaryDB.db!.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${this.dbName}`);
    addLog(`${newCountResult?.count || 0} entries processed. Indexing...`);

    // Get 2 random records:
    console.log('Preview of random 2 records:');
    console.log(await this.dictionaryDB.db!.getAllAsync<DictionaryEntry>(`SELECT * FROM ${this.dbName} ORDER BY RANDOM() LIMIT 1`));
    console.log(await this.dictionaryDB.db!.getAllAsync<DictionaryEntry>(`SELECT * FROM ${this.dbName} ORDER BY RANDOM() LIMIT 1`));

    addLog('Dictionary ready!');

    await this.dictionaryDB.createIndexes();
  }

  async getWordSet(): Promise<Set<string>> {
    const words = await this.dictionaryDB.getWordList();
    return new Set(words);
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
    const words = phrase.toLowerCase().split(/\s+/g);
    const results = new Set<DictionaryEntry>();

    for (const word of words) {
      const matches = await this.dictionaryDB.fieldContains('head', word);
      matches.forEach(match => results.add(transformToDictionaryEntry(match)));
    }

    return Array.from(results);
  }
}
