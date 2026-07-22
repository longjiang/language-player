export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined;

export interface DictionaryEntry {
  id: string; // HSK CEDICT's IDs take the form of "traditional,pinyin,index" e.g. "中國,zhōng_guó,0"
  head: string;
  definitions: string[];

  // optional
  pronunciation?: string;
  alternate?: string;
  level?: Level;
  /** @deprecated Use phonetic_detail or part_of_speech from shared LexicalEntry instead. */
  pos?: string;

  // hsk-cedict
  hskId?: number;

  /** Language-specific phonetic detail.
   *  Mirrors @langplayer/shared DictionaryEntry.phonetic_detail.
   *  Populated by normalizers from raw dictionary CSV data. */
  phonetic_detail?: {
    pinyin?: string;
    kana?: string;
    romaji?: string;
    jyutping?: string;
    romanization?: string;
    ipa?: string;
  } | null;
};

export interface RawEntry {
  id?: string;
  hskId?: string;
  head?: string;
  pronunciation?: string;
  definitions?: string;
  pos?: string;

  // hsk-cedict, dialect-dict and cc-canto
  simplified?: string;
  traditional?: string | undefined;
  pinyin?: string;

  // hsk-cedict
  hsk?: string;
  
  // dialect-dict
  english?: string;

  // cc-canto
  jyutping?: string;

  // edict
  kanji?: string;
  kana?: string;

  // kengdic
  hangul?: string;
  hanja?: string;

  // wiktionary
  word?: string;
  han?: string;
}