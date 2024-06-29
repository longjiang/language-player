// @/src/languages.ts

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Papa from 'papaparse';
import { LANGS_WITH_CONTENT, LANGS_YOUTUBE_SUPPORTS, LANGS_WITH_LIVE_TV, LANGS_WITH_AZURE_TRANSLATE, LANGS_WITH_LEVELS } from '@/constants/LanguageConstants';

export type Language = {
  id: number;
  name: string;
  vernacularName: string;
  otherNames: string;
  wiktionary: number;
  glottologId: string;
  glottologFamilyId: string;
  glottologParentId: string;
  level: string;
  lat: number;
  long: number;
  country: string;
  iso639_3: string;
  iso639_1: string;
  scope: string;
  type: string;
  speakers: number;
  logo: string;
  logoDesc: string;
  has: {
    content: boolean;
    youtube: boolean;
    liveTV: boolean;
    azureTranslate: boolean;
    levels: boolean;
  };
};

class Languages {
  private static instance: Languages;
  private static languages: any[];
  private static countries: any[];
  private static hours: any[];
  private static locales: any[];
  private static scripts: any[];

  private constructor() {}

  public static async getInstance(): Promise<Languages> {
    if (!this.instance) {
      this.instance = new Languages();
      await this.loadData();
    }
    return this.instance;
  }

  private static async loadData() {
    const languages = await this.loadCSV(require('@/data/languages/json-export/languages.json')) || []
    this.languages = languages.map((lang: any, index: number) => {
      return {
        ...lang,
        has: {
          content: LANGS_WITH_CONTENT.includes(lang.iso639_3),
          youtube: LANGS_YOUTUBE_SUPPORTS.includes(lang.iso639_3),
          liveTV: LANGS_WITH_LIVE_TV.includes(lang.iso639_3),
          azureTranslate: LANGS_WITH_AZURE_TRANSLATE.includes(lang.iso639_3),
          levels: LANGS_WITH_LEVELS.includes(lang.iso639_3)
        }
      }
    })
    this.countries = await this.loadCSV(require('@/data/languages/json-export/countries.json'));
    this.hours = await this.loadCSV(require('@/data/languages/json-export/hours.json'));
    this.locales = await this.loadCSV(require('@/data/languages/json-export/locales.json'));
    this.scripts = await this.loadCSV(require('@/data/languages/json-export/scripts.json'));
  }

  private static async loadCSV(assetModule: any): Promise<any[]> {
    return new Promise((resolve) => {
        Papa.parse(assetModule.csvData, {
            header: true,
            complete: (results) => {
                resolve(results.data);
            }
        });
    });
}

  public getLangByCode1(code: string) {
    const language = Languages.languages.find(lang => lang.iso639_1 === code);
    return language || null;
  }

  public getLangByCode3(code: string) {
    const language = Languages.languages.find(lang => lang.iso639_3 === code);
    return language || null;
  }

  public getLangById(id: number) {
    const language = Languages.languages.find(lang => lang.id === id);
    return language || null;
  }

  public getLanguages() {
    return Languages.languages;
  }


  public static getLocales(lang: Language) {
    return Languages.locales.filter(locale => locale.code === lang.iso639_3);
  }

  public static getCountries(lang: Language) {
    return Languages.countries.filter(country => country.languages.split(',').includes(lang.iso639_3));
  }

  public static getHours(lang: Language) {
    return Languages.hours.find(hour => hour['iso639-3'] === lang.iso639_3);
  }

  public static getScripts(lang: Language) {
    return Languages.scripts.filter(script => script.lang === lang.iso639_3);
  }
}

export default Languages;
