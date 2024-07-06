// @/src/dictionary.ts

// @/src/dictionary.ts

import axios from 'axios';
import Papa from 'papaparse';
import { DictionaryDB } from '@/src/dictionary-db';
import { getDictionaryProfile } from '@/src/dictionary-profile';
import { stripAccents } from '@/src/utils';
import { DictionaryEntry, RawEntry, Level } from '@/src/dictionary-types';
import { sortEntries, transformToDictionaryEntry } from '@/src/dictionary-utils';
import { Language } from '@/src/languages';

/**
 * Manages dictionary operations including data loading, searching, and retrieval.
 */
export class Dictionary {
  private dictionaryDB: DictionaryDB;
  private dbName: string;
  private sourceUrl: string;
  private normalizeEntry: (entry: RawEntry, entryCount: Record<string, number>) => DictionaryEntry;
  private t: (key: string, params?: Record<string, any>) => string;

  readonly l1Code: string;
  readonly l2Code: string;

  /**
   * Creates a new Dictionary instance.
   * @param l2Lang - The target language
   * @param t - Translation function for internationalization
   */
  constructor(l2Lang: Language, t: (key: string, params?: Record<string, any>) => string) {
    const { dbName, l1Code, sourceUrl, normalizeEntry } = getDictionaryProfile(l2Lang);
    this.dbName = dbName;
    this.l1Code = l1Code;
    this.l2Code = l2Lang.code;
    this.sourceUrl = sourceUrl;
    this.dictionaryDB = new DictionaryDB(this.dbName);
    this.normalizeEntry = normalizeEntry;
    this.t = t;
  }

  /**
   * Loads dictionary data from the source URL.
   * @param forceRebuild - Whether to force a rebuild of the database
   * @param addLog - Function to add log messages
   */
  async loadData(forceRebuild: boolean = false, addLog: (message: string) => void): Promise<void> {
    await this.dictionaryDB.openDB();
    await this.dictionaryDB.createTable(forceRebuild);

    const loaded = await this.dictionaryDB.loaded();

    if (loaded) {
      addLog(this.t('log.database_already_loaded'));
      return;
    }

    addLog(this.t('log.downloading'));
    const response = await axios.get(this.sourceUrl);
    const parsedData = Papa.parse(response.data, { header: true });

    const entryCount: Record<string, number> = {};
    const entries = parsedData.data.map(entry => this.normalizeEntry(entry as RawEntry, entryCount)).filter(entry => entry.head);

    addLog(this.t('log.processing'));
    const indexPronunciation = ['zh', 'ja', 'ko'].includes(this.l2Code); // Add the ability to search by pronunciation for CJK languages
    await this.dictionaryDB.insertEntries(entries, indexPronunciation);

    const newCountResult = await this.dictionaryDB.db!.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${this.dbName}`);
    addLog(this.t('log.entries_processed', { count: newCountResult?.count || 0 }));

    // Get 2 random records:
    console.log('Preview of two random records:');
    console.log(await this.dictionaryDB.db!.getAllAsync<DictionaryEntry>(`SELECT * FROM ${this.dbName} ORDER BY RANDOM() LIMIT 1`));
    console.log(await this.dictionaryDB.db!.getAllAsync<DictionaryEntry>(`SELECT * FROM ${this.dbName} ORDER BY RANDOM() LIMIT 1`));

    addLog(this.t('log.dictionary_ready'));

    await this.dictionaryDB.createIndexes();
  }

  /**
   * Retrieves the set of all words in the dictionary.
   * This is for passing to the tokenizer for breaking text into words in continua languages.
   * @returns A Set of all words
   */
  async getWordSet(): Promise<Set<string>> {
    const words = await this.dictionaryDB.getWordList();
    return new Set(words);
  }

  /**
   * Retrieves a dictionary entry by its ID.
   * @param id - The entry ID
   * @returns The dictionary entry or undefined if not found
   */
  async getEntry(id: string): Promise<DictionaryEntry | null> {
    const result = await this.dictionaryDB.get(id);
    return result ? transformToDictionaryEntry(result) : null;
  }


  /**
   * Searches the dictionary for entries matching the query.
   * This is for the user to type in the dictionary search bar and get suggestions.
   * @param query - The search query
   * @param limit - Optional limit for the number of results (default: 50)
   * @returns An array of matching dictionary entries
   */
  async search(query: string, limit: number = 50): Promise<DictionaryEntry[]> {
    query = stripAccents(query.toLowerCase()).replace(/\s+/g, ' ');
    const results = await this.dictionaryDB.search(query, limit);

    const entries = results.map(transformToDictionaryEntry);
    return sortEntries(entries, query).slice(0, limit);
  }

  /**
   * Finds dictionary entries for words contained in a phrase.
   * For example, if the phrase is "ABCXYZ", this method will search for entries
   * for "ABC" and "XYZ".
   * @param phrase - The phrase to search within
   * @returns An array of matching dictionary entries
   */
  async findWordsInPhrase(phrase: string): Promise<DictionaryEntry[]> {
    const words = phrase.toLowerCase().split(/\s+/g);
    const results = new Set<DictionaryEntry>();

    for (const word of words) {
      const matches = await this.dictionaryDB.phraseContainsFields(word, ['head', 'alternate']);
      matches.forEach(match => results.add(transformToDictionaryEntry(match)));
    }

    return Array.from(results);
  }

  /**
   * Calculates a match score for an entry against the given lemmas.
   * @param entry - The dictionary entry to score
   * @param lemmas - The normalized lemmas to match against
   * @returns A numerical score representing the closeness of the match
   */
  private calculateMatchScore(entry: DictionaryEntry, lemmas: string[]): number {
    let score = 0;
    const entryForms = [
      stripAccents(entry.head.toLowerCase()),
      ...(entry.alternate?.map(alt => stripAccents(alt.toLowerCase())) || [])
    ];

    for (const lemma of lemmas) {
      if (entryForms.includes(lemma)) {
        score += 2; // Exact match
      } else if (entryForms.some(form => form.startsWith(lemma) || lemma.startsWith(form))) {
        score += 1; // Partial match
      }
    }

    return score;
  }
  
  /**
   * Retrieves dictionary entries whose head or alternate forms closely match the given lemmas.
   * @param lemmas - An array of lemma strings to match against
   * @returns An array of matching dictionary entries, sorted by relevance
   */
  async findEntriesByLemmas(searchTerms: string[], limit: number = 10): Promise<DictionaryEntry[]> {
    const normalizedTerms = searchTerms.map(term => stripAccents(term.toLowerCase()));
    
    const rawResults = await this.dictionaryDB.flexibleSearch(
      normalizedTerms,
      ['head', 'alternate'],
      {
        matchTypes: ['exact', 'contains'],
        bidirectional: true,
        limit,
        priorityWeights: normalizedTerms.map((_, index) => 
          index < normalizedTerms.length - 1 ? 2 : 1  // Higher weight for lemmas
        )
      }
    );
  
    return rawResults.map(transformToDictionaryEntry);
  }
}