import langs from 'langs';
import hash from 'string-hash';
import { edictPOS } from '@/src/edict-pos';

import { RawEntry, DictionaryEntry, Level } from '@/src/dictionary-types';

export const iso1To3 = (code: string) => {
  const language = langs.where("1", code);  // Find language by ISO 639-1 code
  if (language) {
      return language['3'];  // Return ISO 639-3 code if found
  }
  return code;  // Return original code if not found
}

export const getDictionaryProfile = (l2Code: string) => {
  let dbName, l1Code, sourceUrl, normalizeEntry
  if (['zh', 'ltc', 'lzh'].includes(l2Code)) {
    dbName = `hsk_cedict_${l2Code}`;
    l1Code = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt';
    normalizeEntry = normalizeCedictEntry;
  } else if (['hak', 'nan'].includes(l2Code)) {
    dbName = `chinese_dialect_${l2Code}`;
    l1Code = 'zh';
    sourceUrl = 'https://server.chinesezerotohero.com/data/chinese-dialect/chinese_dialect.csv.txt';
    normalizeEntry = normalizeDialectDictEntry
  } else if (l2Code === 'yue') {
    dbName = `cc_canto_${l2Code}`;
    l1Code = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/cc-canto/cccanto-webdist.csv.txt';
    normalizeEntry = normalizeCCCantoEntry;
  } else if (l2Code === 'ja') {
    dbName = `edict_${l2Code}`;
    l1Code = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/edict/edict.tsv.txt';
    normalizeEntry = normalizeEdictEntry;
  } else if (l2Code === 'ko') {
    dbName = `kengdic_${l2Code}`;
    l1Code = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/kengdic/kengdic_2011.tsv.txt';
  } else {
    dbName = `wiktionary_${l2Code}`;
    l1Code = 'en';
    sourceUrl = `https://server.chinesezerotohero.com/data/wiktionary-csv/${iso1To3(l2Code)}-eng.csv.txt`;
    normalizeEntry = normalizeWiktionaryEntry;
  }
  return { dbName, l1Code, sourceUrl, normalizeEntry}
}

export const normalizeCedictEntry = (
  entry: RawEntry,
  entryCount: Record<string, number>
): DictionaryEntry => {
  const level: Level = (parseInt(entry.hsk) as Level) || undefined;
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
    alternate: entry.traditional,
    pronunciation: entry.jyutping,
    definitions,
    level: undefined,
    pos: posKey ? edictPOS[posKey] || posKey : posKey
  };


}
export const normalizeKengdicEntry = (entry: RawEntry): DictionaryEntry => {
  const hangul = entry.hangul.replace(/^\-/, ''); // Normalize Hangul: Remove leading hyphen if present
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