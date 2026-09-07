/**
 * Curated external-search links for the popup dictionary's "External Search"
 * panel (SPEC-094). Pure, platform-agnostic — no React/RN imports (ADR-0003).
 *
 * The set of sources and their per-language availability are derived from
 * Classic (`zerotohero-nuxt/components/LookUpIn.vue`,
 * `zerotohero-nuxt/components/EntryExternal.vue`), the source of truth for
 * which external references the app offers per language. Both apps share this
 * builder so the option set stays consistent.
 */

export type ExternalSearchGroup = 'images' | 'reference' | 'dictionaries';

export interface ExternalSearchLink {
  /** Stable id for React list keys. */
  key: string;
  /** i18n key resolved with `t()` (see `externalSearchTitleKey`). */
  titleKey: string;
  /** Fully-built URL with `term` (and `traditional`) substituted. */
  url: string;
  /** Site domain, used to build the favicon URL. */
  domain: string;
}

export interface ExternalSearchOptions {
  /** The surface form under lookup. */
  term: string;
  /** ISO 639-1 native (L1) language code. */
  l1Code: string;
  /** ISO 639-1 target (L2) language code. */
  l2Code: string;
  /** Localized target-language name, for the Wiktionary fragment. */
  l2Name: string;
  /** L2 uses Han (Chinese-character) script. */
  l2Han: boolean;
  /** L1 uses Han (Chinese-character) script. */
  l1Han: boolean;
  /** Optional traditional-script form of `term` (for CJK sources). */
  traditional?: string;
}

/** Han-script language codes — must match apps' `isHan` sets. */
export const HAN_SCRIPT_CODES = new Set([
  'zh', 'yue', 'lzh', 'nan', 'hak', 'wuu', 'hsn', 'cjy', 'cpx', 'czh', 'cdo', 'cng', 'gan', 'mnp',
]);

/** Whether an ISO code uses the Han script. */
export function isHanScript(code: string): boolean {
  return HAN_SCRIPT_CODES.has(code);
}

/** Favicon URL from a site's domain via the Google favicon service. */
export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`;
}

/** Google Ngrams corpus id per language (Classic mapping). */
const NGRAM_CORPUS: Record<string, number> = { en: 26, zh: 34, fr: 30, de: 31, he: 35, it: 33, ru: 36, es: 32 };

/** The per-language `{l2}/KO` Naver dictionaries Classic generates. */
const NAVER_KO_PAIRS: string[] = [
  'fr', 'es', 'de', 'vi', 'ne', 'lo', 'my', 'sw', 'ar', 'ur', 'uz', 'id', 'km',
  'tl', 'th', 'tet', 'fa', 'ha', 'he', 'hbo', 'hi', 'el', 'grc', 'nl', 'no',
  'da', 'la', 'ru', 'ro', 'sv', 'sq', 'uk', 'it', 'ka', 'cs', 'hr', 'tr',
  'pt', 'pl', 'fi', 'hu',
];

/** The per-language `{l2}/EN` Naver dictionaries Classic generates. */
const NAVER_EN_PAIRS: Record<string, string> = {
  ru: 'russian', vi: 'vietnamese', es: 'spanish', id: 'indonesian', ja: 'japanese',
  zh: 'chinese', pt: 'portuguese',
};

const enc = encodeURIComponent;

function hanBridge(l2Code: string, l2Han: boolean, l1Code: string, l1Han: boolean): boolean {
  // Classic: "Naver Ko/Zh" when (L2 han && L1 ko) OR (L2 ko && L1 han).
  return (l2Han && l1Code === 'ko') || (l2Code === 'ko' && l1Han);
}

/**
 * Build the grouped external-search links for a word.
 *
 * Order is preserved: `images` → `reference` → `dictionaries`. Sources that do
 * not apply to the given language pair are filtered out.
 */
export function buildExternalSearchLinks(opts: ExternalSearchOptions): ExternalSearchLink[] {
  const { term, l1Code, l2Code: rawL2, l2Name, l2Han, l1Han, traditional } = opts;
  const l2Code = rawL2;
  const termEnc = enc(term);
  // Canonical term for CJK-enriched sources (Moedict): prefer the caller's
  // traditional form, else the term as-is.
  const cjk = traditional && traditional.trim() ? traditional : term;
  const cjkEnc = enc(cjk);

  const links: ExternalSearchLink[] = [];

  // ── Images ─────────────────────────────────────────────────────

  links.push({
    key: 'google-images',
    titleKey: 'external.google_images',
    url: `https://www.google.com/search?q=${termEnc}&tbm=isch`,
    domain: 'www.google.com',
  });

  // ── Reference ──────────────────────────────────────────────────

  links.push({
    key: 'wikipedia',
    titleKey: 'external.wikipedia',
    // Classic: search the user's native (L1) Wikipedia.
    url: `https://${enc(l1Code)}.m.wikipedia.org/w/index.php?search=${termEnc}`,
    domain: 'wikipedia.org',
  });

  if (l2Han) {
    links.push({
      key: 'baidu-baike',
      titleKey: 'external.baidu_baike',
      url: `https://baike.baidu.com/item/${termEnc}`,
      domain: 'baike.baidu.com',
    });
  }

  if (l2Code in NGRAM_CORPUS) {
    const corpus = NGRAM_CORPUS[l2Code];
    const yearStart = l2Code === 'zh' ? 1900 : 1800;
    links.push({
      key: 'usage-trends',
      titleKey: 'external.usage_trends',
      url: `https://books.google.com/ngrams/graph?content=${termEnc}&year_start=${yearStart}&year_end=2019&corpus=${corpus}&smoothing=3`,
      domain: 'books.google.com',
    });
  }

  if (l2Code === 'zh') {
    links.push({
      key: 'grammar-wiki',
      titleKey: 'external.grammar_wiki',
      url: `https://resources.allsetlearning.com/gramwiki/?search=${termEnc}`,
      domain: 'resources.allsetlearning.com',
    });
  }

  if (l2Han) {
    links.push({
      key: 'moedict',
      titleKey: 'external.moedict',
      url: `https://www.moedict.tw/${cjkEnc}`,
      domain: 'www.moedict.tw',
    });
  }

  if (l2Code === 'en') {
    links.push({
      key: 'etymonline',
      titleKey: 'external.etymonline',
      url: `https://www.etymonline.com/word/${termEnc}`,
      domain: 'www.etymonline.com',
    });
  }

  // ── Dictionaries ───────────────────────────────────────────────

  links.push({
    key: 'wiktionary',
    titleKey: 'external.wiktionary',
    url: `https://en.m.wiktionary.org/w/index.php?search=${termEnc}#${enc(l2Name)}`,
    domain: 'wiktionary.org',
  });

  if (l2Han) {
    links.push({
      key: 'zdic',
      titleKey: 'external.zdic',
      url: `https://www.zdic.net/hans/${termEnc}`,
      domain: 'www.zdic.net',
    });
  }

  if (l2Code === 'en') {
    links.push({
      key: 'cambridge',
      titleKey: 'external.cambridge',
      url: `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${termEnc}`,
      domain: 'dictionary.cambridge.org',
    });
  }

  if (l2Code === 'ja') {
    links.push(
      {
        key: 'jisho',
        titleKey: 'external.jisho',
        url: `https://jisho.org/search/${termEnc}`,
        domain: 'jisho.org',
      },
      {
        key: 'weblio',
        titleKey: 'external.weblio',
        url: `https://ejje.weblio.jp/content/${termEnc}`,
        domain: 'ejje.weblio.jp',
      },
      {
        key: 'jpdb',
        titleKey: 'external.jpdb',
        url: `https://jpdb.io/search?q=${termEnc}`,
        domain: 'jpdb.io',
      },
      {
        key: 'japandict',
        titleKey: 'external.japandict',
        url: `https://www.japandict.com/${termEnc}`,
        domain: 'www.japandict.com',
      },
      {
        key: 'tangorin',
        titleKey: 'external.tangorin',
        url: `https://tangorin.com/words?search=${termEnc}&lang=eng`,
        domain: 'tangorin.com',
      },
    );
  }

  if (l2Code === 'ko') {
    links.push(
      {
        key: 'naver-koko',
        titleKey: 'external.naver_koko',
        url: `https://ko.dict.naver.com/#/search?query=${termEnc}`,
        domain: 'ko.dict.naver.com',
      },
      {
        key: 'naver-hanja',
        titleKey: 'external.naver_hanja',
        url: `https://hanja.dict.naver.com/#/search?query=${termEnc}&range=all`,
        domain: 'hanja.dict.naver.com',
      },
    );
    if (l1Code === 'en') {
      links.push({
        key: 'naver-koen',
        titleKey: 'external.naver_koen',
        url: `https://korean.dict.naver.com/koendict/dict/#/search?query=${termEnc}`,
        domain: 'korean.dict.naver.com',
      });
    }
  }

  if (l2Code === 'en') {
    links.push({
      key: 'naver-enen',
      titleKey: 'external.naver_enen',
      url: `https://english.dict.naver.com/english-dictionary/#/search?query=${termEnc}`,
      domain: 'english.dict.naver.com',
    });
    if (l1Code === 'ko') {
      links.push({
        key: 'naver-enko',
        titleKey: 'external.naver_enko',
        url: `https://en.dict.naver.com/#/search?query=${termEnc}&range=all`,
        domain: 'en.dict.naver.com',
      });
    }
  }

  if (l2Code === 'ja' && l1Code === 'ko') {
    links.push({
      key: 'naver-jako',
      titleKey: 'external.naver_jako',
      url: `https://ja.dict.naver.com/#/search?query=${termEnc}&range=all`,
      domain: 'ja.dict.naver.com',
    });
  }

  if (hanBridge(l2Code, l2Han, l1Code, l1Han)) {
    links.push({
      key: 'naver-kozh',
      titleKey: 'external.naver_kozh',
      url: `https://zh.dict.naver.com/#/search?query=${termEnc}`,
      domain: 'zh.dict.naver.com',
    });
  }

  if ((l2Code === 'es' && l1Code === 'ko') || (l2Code === 'ko' && l1Code === 'es')) {
    links.push({
      key: 'naver-esko',
      titleKey: 'external.naver_esko',
      url: `https://dict.naver.com/eskodict/#/search?query==${termEnc}`,
      domain: 'dict.naver.com',
    });
  }

  if ((l2Code === 'de' && l1Code === 'ko') || (l2Code === 'ko' && l1Code === 'de')) {
    links.push({
      key: 'naver-deko',
      titleKey: 'external.naver_deko',
      url: `https://dict.naver.com/dekodict/#/search?query==${termEnc}`,
      domain: 'dict.naver.com',
    });
  }

  // Youdao dictionaries for Chinese L1 users.
  if (l1Code === 'zh' && ['en', 'ja', 'fr', 'ko'].includes(l2Code)) {
    const slug = l2Code === 'ja' ? 'jap' : l2Code;
    links.push({
      key: 'youdao',
      titleKey: 'external.youdao',
      url: `http://dict.youdao.com/w/${slug}/${termEnc}`,
      domain: 'dict.youdao.com',
    });
  }

  // Naver {l2}/KO dictionaries (gated on the ko pairing).
  for (const pair of NAVER_KO_PAIRS) {
    const applies = (l2Code === pair && l1Code === 'ko') || (l2Code === 'ko' && l1Code === pair);
    if (applies) {
      links.push({
        key: `naver-${pair}-ko`,
        titleKey: 'external.naver',
        url: `https://dict.naver.com/${pair}kodict/#/search?query==${termEnc}`,
        domain: 'dict.naver.com',
      });
    }
  }

  // Naver {l2}/EN dictionaries (gated on the en pairing).
  for (const pair of Object.keys(NAVER_EN_PAIRS)) {
    const applies = (l2Code === pair && l1Code === 'en') || (l2Code === 'en' && l1Code === pair);
    if (applies) {
      links.push({
        key: `naver-${pair}-en`,
        titleKey: 'external.naver',
        url: `https://english.dict.naver.com/english-${NAVER_EN_PAIRS[pair]}-dictionary/#/search?query=${termEnc}`,
        domain: 'english.dict.naver.com',
      });
    }
  }

  return links;
}

/** Group the links under the three headings, in spec order. */
export function groupExternalSearchLinks(
  links: ExternalSearchLink[],
): { group: ExternalSearchGroup; links: ExternalSearchLink[] }[] {
  const order: ExternalSearchGroup[] = ['images', 'reference', 'dictionaries'];
  return order
    .map((group) => ({ group, links: links.filter((l) => groupOfLink(l) === group) }))
    .filter((g) => g.links.length > 0);
}

/** Map a link back to its group (derived from its position in the canonical
 *  source ordering). Kept as an explicit table so group membership is
 *  unambiguous regardless of insertion order. */
const GROUP_BY_KEY: Record<string, ExternalSearchGroup> = {
  'google-images': 'images',
  wikipedia: 'reference',
  'baidu-baike': 'reference',
  'usage-trends': 'reference',
  'grammar-wiki': 'reference',
  moedict: 'reference',
  etymonline: 'reference',
  wiktionary: 'dictionaries',
  zdic: 'dictionaries',
  cambridge: 'dictionaries',
  jisho: 'dictionaries',
  weblio: 'dictionaries',
  jpdb: 'dictionaries',
  japandict: 'dictionaries',
  tangorin: 'dictionaries',
  'naver-koko': 'dictionaries',
  'naver-hanja': 'dictionaries',
  'naver-koen': 'dictionaries',
  'naver-enen': 'dictionaries',
  'naver-enko': 'dictionaries',
  'naver-jako': 'dictionaries',
  'naver-kozh': 'dictionaries',
  'naver-esko': 'dictionaries',
  'naver-deko': 'dictionaries',
  youdao: 'dictionaries',
};

function groupOfLink(link: ExternalSearchLink): ExternalSearchGroup {
  // Naver {l2}/KO and {l2}/EN are generated per-pair; anything not in the
  // explicit table defaults to dictionaries.
  return GROUP_BY_KEY[link.key] ?? 'dictionaries';
}

/** Group title i18n keys, in spec order. */
export const EXTERNAL_SEARCH_GROUP_TITLES: Record<ExternalSearchGroup, string> = {
  images: 'title.external_images',
  reference: 'title.external_reference',
  dictionaries: 'title.external_dictionaries',
};
