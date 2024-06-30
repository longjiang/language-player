import { PYTHON_SERVER } from "@/src/api/python"


// Define an interface for the token structure, adjust according to actual data structure
export interface TokenData {
  // Example properties, modify according to the actual structure you expect
  word?: string;
  pronunciation?: string;
}

type TokenizerEndpointMap = {
  [tokenizer: string]: string[];
};

export const tokenizerEndpoints = {
  'lemmatize-arabic':    ["ar"],     // Qalsadi
  'lemmatize-turkish':   ["tr"],     // Zeyrek
  'lemmatize-persian':   ["fa"],     // HazmTokenizer
  'lemmatize-japanese':  ["ja"],     // MeCabTokenizer
  'lemmatize-korean':    ["ko"],     // OpenKoreanTextTokenizer
  'lemmatize-chinese':   ["zh"],     // JiebaTokenizer
  'lemmatize-russian':   ["ru"],     // Pymorphy2Tokenizer
  'lemmatize-burmese':   ["my"],     // PyidaungsuTokenizer
  'lemmatize-spacy':     ['es'],     // SpacyTokenizer
  // SimplemmaTokenizer
  'lemmatize-simple':    ['ast', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'enm', 'et', 'fi', 'gd', 'ga', 'gl', 'gv', 'sh', 'hu', 'hy', 'id', 'is', 'it', 'ka', 'la', 'lv', 'lt', 'lb', 'mk', 'ms', 'nl', 'nn', 'no', 'nb', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'se', 'es', 'sq', 'sw', 'sv', 'tl', 'tr', 'uk'],
  // LemmatizationListTokenizer
  'lemmatization-lists': ['ast', 'bg', 'ca', 'cs', 'cy', 'de', 'en', 'et', 'fa', 'fr', 'gd', 'ga', 'gl', 'gv', 'hu', 'it', 'pt', 'ro', 'ru', 'sk', 'sl', 'es', 'sv', 'uk'],
} as TokenizerEndpointMap;

export const getTokenizerEndpoint = (languageCode: string): string | null => {
  for (let tokenizer in tokenizerEndpoints) {
    if (tokenizerEndpoints[tokenizer].includes(languageCode)) {
      return tokenizer;
    }
  }
  return null;
}


export const tokenize = async (text: string) => {
  try {
    const endpoint = getTokenizerEndpoint('zh');
    const response = await fetch(
      `${PYTHON_SERVER}/${endpoint}?text=${encodeURIComponent(text)}`
    );
    const tokens: TokenData[] = await response.json();
    return tokens;
  } catch (error) {
    console.error("Error fetching tokens:", error);
  }
};