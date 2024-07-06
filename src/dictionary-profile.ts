import hash from 'string-hash';
import { edictPOS } from '@/src/edict-pos';
import { Language } from '@/src/languages';
import { CZH_SERVER_DATA } from '@/src/api/czh-server';
import { RawEntry, DictionaryEntry, Level } from '@/src/dictionary-types';

// New import statements for local assets
import hskCedictData from '@/data/dictionaries/json-export/hsk_cedict.csv.json';
import edictData from '@/data/dictionaries/json-export/edict.tsv.json';
import kengdicData from '@/data/dictionaries/json-export/kengdic_2011.tsv.json';
import engWiktionaryData from '@/data/dictionaries/json-export/eng-eng.csv.json';
import spaWiktionaryData from '@/data/dictionaries/json-export/spa-eng.csv.json';
import fraWiktionaryData from '@/data/dictionaries/json-export/fra-eng.csv.json';

export const getDictionaryProfile = (l2Lang: Language) => {
  const l2Code = l2Lang.code;
  let dbName, l1Code, sourceUrl, normalizeEntry, localData;

  if (['zh', 'ltc', 'lzh'].includes(l2Code)) {
    dbName = `hsk_cedict_${l2Code}`;
    l1Code = 'en';
    sourceUrl = CZH_SERVER_DATA + '/hsk-cedict/hsk_cedict.csv.txt';
    localData = hskCedictData;
    normalizeEntry = normalizeCedictEntry;
  } else if (['hak', 'nan'].includes(l2Code)) {
    dbName = `chinese_dialect_${l2Code}`;
    l1Code = 'zh';
    sourceUrl = CZH_SERVER_DATA + '/' + { hak: 'dict-hakka/dict-hakka.csv.txt', nan: 'dict-twblg/dict-twblg.csv.txt' }[l2Code];
    normalizeEntry = normalizeDialectDictEntry;
  } else if (l2Code === 'yue') {
    dbName = `cc_canto_${l2Code}`;
    l1Code = 'en';
    sourceUrl = CZH_SERVER_DATA + '/cc-canto/cccanto-webdist.csv.txt';
    normalizeEntry = normalizeCCCantoEntry;
  } else if (l2Code === 'ja') {
    dbName = `edict_${l2Code}`;
    l1Code = 'en';
    sourceUrl = CZH_SERVER_DATA + '/edict/edict.tsv.txt';
    localData = edictData;
    normalizeEntry = normalizeEdictEntry;
  } else if (l2Code === 'ko') {
    dbName = `kengdic_${l2Code}`;
    l1Code = 'en';
    sourceUrl = CZH_SERVER_DATA + '/kengdic/kengdic_2011.tsv.txt';
    localData = kengdicData;
    normalizeEntry = normalizeKengdicEntry;
  } else {
    dbName = `wiktionary_${l2Code}`;
    l1Code = 'en';
    sourceUrl = CZH_SERVER_DATA + `/wiktionary-csv/${l2Lang.iso639_3}-eng.csv.txt`;
    if (['eng', 'spa', 'fra'].includes(l2Lang.iso639_3)) {
      localData = {
        eng: engWiktionaryData,
        spa: spaWiktionaryData,
        fra: fraWiktionaryData
      }[l2Lang.iso639_3];
    }
    normalizeEntry = normalizeWiktionaryEntry;
  }
  return { dbName, l1Code, sourceUrl, localData, normalizeEntry };
}

export const normalizeCedictEntry = (
  entry: RawEntry,
  entryCount: Record<string, number>
): DictionaryEntry => {
  const level: Level = entry.hsk ? parseInt(entry.hsk) as Level : undefined;
  const definitionsArray = entry.definitions
    ? entry.definitions.split("/").map((def) => def.trim())
    : [];
  return {
    id: generateUniqueId(entry, entryCount),
    hskId: entry.hskId ? parseInt(entry.hskId) : undefined,
    head: entry.simplified || "",
    pronunciation: entry.pinyin || "",
    alternate: entry.traditional,
    definitions: definitionsArray,
    level,
  };
};

export const normalizeDialectDictEntry = (entry: RawEntry): DictionaryEntry => {
  let definitionsArray = entry.definitions?.split('|').map(d => d.trim()) || [];

  return {
    id: "d" + hash(entry.traditional + definitionsArray[0]),
    head: entry.simplified || "",
    alternate: entry.traditional,
    pronunciation: entry.pronunciation || "",
    definitions: definitionsArray,
    level: undefined
  };
}

export const normalizeCCCantoEntry = (entry: RawEntry): DictionaryEntry => {
  let definitionsArray = entry.english?.split('/').map(d => d.trim()) || [];

  return {
    id: "d" + hash(entry.traditional + definitionsArray[0]),
    head: entry.simplified || "",
    alternate: entry.traditional,
    pronunciation: entry.jyutping || "",
    definitions: definitionsArray,
    level: undefined
  };
}

export const normalizeEdictEntry = (entry: RawEntry):DictionaryEntry => {
  const definitions = entry.english ? entry.english.replace(/\(.*?\)/gi, '').replace('/(P)', '').split('/').filter(d => d !== '') : [];
  let posKey = entry.english ? entry.english.replace(/^\((.*?)\).*/gi, "$1").split(',')[0] : undefined;
  return {
    id: entry.id || "",
    head: entry.kanji || entry.kana || "",
    alternate: entry.kana,
    pronunciation: entry.kana,
    definitions,
    level: undefined,
    pos: posKey ? edictPOS[posKey] || posKey : posKey
  };


}
export const normalizeKengdicEntry = (entry: RawEntry): DictionaryEntry => {
  const hangul = entry.hangul ? entry.hangul.replace(/^\-/, '') : ""; // Normalize Hangul: Remove leading hyphen if present
  const definitions = entry.english ? [entry.english] : []; // Definitions are based on the English translations

  const normalizedEntry: DictionaryEntry = {
      id: entry.id || "",
      head: hangul,
      definitions
  };

  // If 'hanja' is present and not a placeholder like 'NULL', include it in the 'canonical' field
  if (entry.hanja && entry.hanja !== "NULL") {
      normalizedEntry.alternate = entry.hanja;
  }

  return normalizedEntry;
};


export const normalizeWiktionaryEntry = (entry: RawEntry): DictionaryEntry => {
  const definitions = entry.definitions ? entry.definitions.split("|") : [];
  const id = "w" + hash(entry.head + (definitions[0] || ''));
  const alternate = entry.han;
  return {
    id,
    head: entry.word || "",
    alternate,
    definitions,
    pronunciation: entry.pronunciation,
  };
};



export const generateUniqueId = (
  entry: RawEntry,
  entryCount: Record<string, number>
): string => {
  const baseId = `${entry.traditional},${(entry.pinyin || "").replace(
    /\s+/g,
    "_"
  )}`;
  const count = (entryCount[baseId] = (entryCount[baseId] || 0) + 1);
  return `${baseId},${count - 1}`;
};