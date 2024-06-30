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
  country: string; // Space-separated list of country codes
  iso639_3: string;
  iso639_1: string;
  code: string; // Either iso639_1 or iso639_3
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

const preferredCountryCodes = {
  af: "ZA",
  ar: "SA",
  az: "AZ",
  bg: "BG",
  bn: "BD",
  bs: "BS",
  ca: "ES",
  cy: "CY",
  da: "DK",
  de: "DE",
  en: "GB",
  es: "ES",
  et: "ET",
  eu: "ES",
  fi: "FI",
  fr: "FR",
  ga: "GA",
  gl: "ES",
  hak: "CN",
  he: "IL",
  hi: "IN",
  hr: "HR",
  hu: "HU",
  id: "ID",
  ie: "IE",
  is: "IS",
  it: "IT",
  ko: "KR",
  la: "LA",
  lv: "LV",
  md: "MD",
  mt: "MT",
  nan: "CN",
  nl: "NL",
  nn: "NO",
  no: "NO",
  pa: "IN",
  pl: "PL",
  pt: "PT",
  ro: "RO",
  ru: "RU",
  sl: "SL",
  sm: "SM",
  sn: "SN",
  sv: "SV",
  ta: "LK",
  to: "TO",
  tr: "TR",
  urd: "PK",
  yue: "HK",
};

class Languages {
  private static instance: Languages;
  private static languages: any[];
  private static countries: any[];
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
        code: lang.iso639_1 || lang.iso639_3,
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

  public getLangIdByCode(code: string) {
    const language = Languages.languages.find(lang => lang.iso639_1 === code || lang.iso639_3 === code);
    return language ? language.id : null;
  }

  public getLangByCode1(code: string) {
    const language = Languages.languages.find(lang => lang.iso639_1 === code);
    return language || null;
  }

  public getLangByCode3(code: string) {
    const language = Languages.languages.find(lang => lang.iso639_3 === code);
    return language || null;
  }

  public getLangByCode(code: string) {
    let language = Languages.languages.find(lang => lang.iso639_1 === code);
    // Make an except for the case of 'zh-Hans' and 'zh-Hant', which only has 'zh' in the languages list
    if (code === 'zh-Hans' || code === 'zh-Hant') {
      language = Languages.languages.find(lang => lang.iso639_3 === 'zho');
      // Add the code to a copy of the language object so that the original object is not modified
      language = { ...language, code, name: code === 'zh-Hans' ? 'Chinese (Simplified)' : 'Chinese (Traditional)' };
    }
    return language || null;
  }

  public getLangById(id: number) {
    const language = Languages.languages.find(lang => lang.id === id);
    return language || null;
  }

  public getLanguages() {
    return Languages.languages;
  }

  public getLocales(lang: Language) {
    return Languages.locales.filter(locale => locale.code === lang.iso639_3);
  }

  public getCountries(lang: Language) {
    const countryCodes = lang.country.split(" ")
    return Languages.countries.filter(country => countryCodes.includes(country.alpha2Code));
  }

  public getCountry(lang: Language) {
    const countryCodes = lang.country.split(" ")
    const countryCode = preferredCountryCodes[lang.code] || countryCodes[0]
    return Languages.countries.find(country => country.alpha2Code === countryCode);
  }

  public getScripts(lang: Language) {
    return Languages.scripts.filter(script => script.lang === lang.iso639_3);
  }
}

export default Languages;
