export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined;

export interface DictionaryEntry {
  id: string; // HSK CEDICT's IDs take the form of "traditional,pinyin,index" e.g. "中國,zhōng_guó,0"
  hskId?: number;
  head: string;
  pronunciation: string;
  alternate?: string;
  definitions: string[];
  level: Level;
};

export interface RawEntry {
  id?: string;
  hskId?: string;
  hsk: string;
  head?: string;
  pronunciation?: string;
  simplified?: string;
  traditional?: string | undefined;
  pinyin?: string;
  definitions?: string;
}