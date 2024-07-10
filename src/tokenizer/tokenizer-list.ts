// @/tokenizer/tokenizer-list

import OpenKoreanTextTokenizer from './openkoreantext-tokenizer';
import JiebaTokenizer from './jieba-tokenizer';
import Pymorphy2Tokenizer from './pymorphy2-tokenizer';
import MeCabTokenizer from './mecab-tokenizer';
import HazmTokenizer from './hazm-tokenizer';
import Zeyrek from './zeyrek-tokenizer';
import Qalsadi from './qalsadi-tokenizer';
import SpacyTokenizer from './spacy-tokenizer';
import SimplemmaTokenizer from './simplemma-tokenizer';
import LemmatizationListTokenizer from './lemmatizationlist-tokenizer';
import PyidaungsuTokenizer from './pyidaungsu-tokenizer';
import { Tokenizer } from '@/types/tokenTypes';


// For these languages, we're not tokenizing with SpaCy, but their remote cache are tokenized with SpaCy
export const languagesWithSpaCyCache = [
  'ca', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hr',
  'it', 'lt', 'mk', 'no', 'nl', 'pl', 'pt', 'ro', 'sv',
  'uk', 'ko'
];

export const tokenizers: Tokenizer[] = [
  {
    module: OpenKoreanTextTokenizer,
    name: 'OpenKoreanTextTokenizer',
    endPoint: 'lemmatize-korean',
    languages: ['ko'],
  },
  {
    module: JiebaTokenizer,
    name: 'JiebaTokenizer',
    endPoint: 'lemmatize-chinese',
    languages: ['zh'],
  },
  {
    module: Pymorphy2Tokenizer,
    name: 'Pymorphy2Tokenizer',
    endPoint: 'lemmatize-russian',
    languages: ['ru'],
  },
  {
    module: PyidaungsuTokenizer,
    name: 'PyidaungsuTokenizer',
    endPoint: 'lemmatize-burmese',
    languages: ['my'],
  },
  {
    module: MeCabTokenizer,
    name: 'MeCabTokenizer',
    endPoint: 'lemmatize-japanese',
    languages: ['ja'],
  },
  {
    module: HazmTokenizer,
    name: 'HazmTokenizer',
    endPoint: 'lemmatize-persian',
    languages: ['fa'],
  },
  {
    module: Zeyrek,
    name: 'Zeyrek',
    endPoint: 'lemmatize-turkish',
    languages: ['tr'],
  },
  {
    module: Qalsadi,
    name: 'Qalsadi',
    endPoint: 'lemmatize-arabic',
    languages: ['ar'],
  },
  {
    module: SpacyTokenizer,
    name: 'SpacyTokenizer',
    endPoint: 'lemmatize-spacy',
    languages: ['es'],
  },
  {
    module: SimplemmaTokenizer,
    name: 'SimplemmaTokenizer',
    endPoint: 'lemmatize-simple',
    languages: ['ast', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'enm', 'et', 'fi', 'gd', 'ga', 'gl', 'gv', 'sh', 'hu', 'hy', 'id', 'is', 'it', 'ka', 'la', 'lv', 'lt', 'lb', 'mk', 'ms', 'nl', 'nn', 'no', 'nb', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'se', 'es', 'sq', 'sw', 'sv', 'tl', 'tr', 'uk'],
  },
  // Disable for now – it's too slow
  // {
  //   module: LemmatizationListTokenizer,
  //   name: 'LemmatizationListTokenizer',
  //   endPoint: 'lemmatize-lemmatization-lists',
  //   languages: ['ast', 'bg', 'ca', 'cs', 'cy', 'de', 'en', 'et', 'fa', 'fr', 'gd', 'ga', 'gl', 'gv', 'hu', 'it', 'pt', 'ro', 'ru', 'sk', 'sl', 'es', 'sv', 'uk'],
  // },
]