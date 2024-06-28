export const getDictionaryProfile = (l2: string) => {
  let dbName, l1, sourceUrl
  if (['zh', 'ltc', 'lzh'].includes(l2)) {
    dbName = `hsk_cedict_${l2}`;
    l1 = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt';
  } else if (['hak', 'nan'].includes(l2)) {
    dbName = `chinese_dialect_${l2}`;
    l1 = 'zh';
    sourceUrl = 'https://server.chinesezerotohero.com/data/chinese-dialect/chinese_dialect.csv.txt';
  } else if (l2 === 'yue') {
    dbName = `cc_canto_${l2}`;
    l1 = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/cc-canto/cc_canto.csv.txt';
  } else if (l2 === 'ja') {
    dbName = `edict_${l2}`;
    l1 = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/edict/edict.csv.txt';
  } else if (l2 === 'ko') {
    dbName = `kengdic_${l2}`;
    l1 = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/kengdic/kengdic.csv.txt';
  } else if (l2 === 'tlh') {
    dbName = `klingonska_${l2}`;
    l1 = 'en';
    sourceUrl = 'https://server.chinesezerotohero.com/data/klingonska/klingonska.csv.txt';
  } else {
    dbName = `wiktionary_${l2}`;
    l1 = 'en';
    sourceUrl = `https://server.chinesezerotohero.com/data/wiktionary/wiktionary_${l2}.csv.txt`;
  }
  return {dbName, l1, sourceUrl}
}