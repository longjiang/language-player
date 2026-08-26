/**
 * Shared HTML/XML entity decoder.
 *
 * Subtitle and caption sources frequently ship text that is HTML-escaped
 * (e.g. `don&#39;t`, `fish &amp; chips`). Some sources — notably YouTube's
 * timedtext formats — DOUBLE-encode them (`don&amp;#39;t`), so a single decode
 * pass leaves `&#39;` visible to the user.
 *
 * This decoder is:
 *  - Cross-platform: pure string/regex logic, no DOM. Works in the Chrome
 *    extension (content script), apps/web (Next.js), and apps/mobile (RN,
 *    which has no `document`).
 *  - Iterative: decodes up to `maxPasses` times so double-encoded entities
 *    collapse to their final character while genuine literal `&` (e.g. "A & B",
 *    "AT&T") is left untouched because an entity requires a trailing `;`.
 *  - DRY-single-source: apps/web and the Chrome extension both delegate here
 *    instead of shipping their own ad-hoc `.replace()` chains.
 */

/** Named (non-numeric) HTML entities most common in subtitles and web text.
 *  Numeric refs (`&#38;` / `&#x2262;`) are handled separately and cover every
 *  Unicode code point, so this list only needs the named forms that subtitles
 *  actually use: the core five plus Latin-1/general-punctuation symbols. */
const NAMED_ENTITIES: Record<string, string> = {
  // Core
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Latin-1 accented / punctuation
  nbsp: '\u00A0',
  iexcl: '\u00A1',
  cent: '\u00A2',
  pound: '\u00A3',
  curren: '\u00A4',
  yen: '\u00A5',
  brvbar: '\u00A6',
  sect: '\u00A7',
  uml: '\u00A8',
  copy: '\u00A9',
  ordf: '\u00AA',
  laquo: '\u00AB',
  not: '\u00AC',
  shy: '\u00AD',
  reg: '\u00AE',
  macr: '\u00AF',
  deg: '\u00B0',
  plusmn: '\u00B1',
  sup2: '\u00B2',
  sup3: '\u00B3',
  acute: '\u00B4',
  micro: '\u00B5',
  para: '\u00B6',
  middot: '\u00B7',
  cedil: '\u00B8',
  sup1: '\u00B9',
  ordm: '\u00BA',
  raquo: '\u00BB',
  frac14: '\u00BC',
  frac12: '\u00BD',
  frac34: '\u00BE',
  iquest: '\u00BF',
  times: '\u00D7',
  divide: '\u00F7',
  // Latin-1 accented letters
  Agrave: '\u00C0', Aacute: '\u00C1', Acirc: '\u00C2', Atilde: '\u00C3',
  Auml: '\u00C4', Aring: '\u00C5', AElig: '\u00C6', Ccedil: '\u00C7',
  Egrave: '\u00C8', Eacute: '\u00C9', Ecirc: '\u00CA', Euml: '\u00CB',
  Igrave: '\u00CC', Iacute: '\u00CD', Icirc: '\u00CE', Iuml: '\u00CF',
  ETH: '\u00D0', Ntilde: '\u00D1', Ograve: '\u00D2', Oacute: '\u00D3',
  Ocirc: '\u00D4', Otilde: '\u00D5', Ouml: '\u00D6', Oslash: '\u00D8',
  Ugrave: '\u00D9', Uacute: '\u00DA', Ucirc: '\u00DB', Uuml: '\u00DC',
  Yacute: '\u00DD', THORN: '\u00DE', szlig: '\u00DF',
  agrave: '\u00E0', aacute: '\u00E1', acirc: '\u00E2', atilde: '\u00E3',
  auml: '\u00E4', aring: '\u00E5', aelig: '\u00E6', ccedil: '\u00E7',
  egrave: '\u00E8', eacute: '\u00E9', ecirc: '\u00EA', euml: '\u00EB',
  igrave: '\u00EC', iacute: '\u00ED', icirc: '\u00EE', iuml: '\u00EF',
  eth: '\u00F0', ntilde: '\u00F1', ograve: '\u00F2', oacute: '\u00F3',
  ocirc: '\u00F4', otilde: '\u00F5', ouml: '\u00F6', oslash: '\u00F8',
  ugrave: '\u00F9', uacute: '\u00FA', ucirc: '\u00FB', uuml: '\u00FC',
  yacute: '\u00FD', thorn: '\u00FE', yuml: '\u00FF',
  // General punctuation / symbols
  euro: '\u20AC',
  trade: '\u2122',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bull: '\u2022',
  dagger: '\u2020',
  Dagger: '\u2021',
  sbquo: '\u201A',
  bdquo: '\u201E',
  permil: '\u2030',
  lsaquo: '\u2039',
  rsaquo: '\u203A',
  oline: '\u203E',
  frasl: '\u2044',
  larr: '\u2190',
  uarr: '\u2191',
  rarr: '\u2192',
  darr: '\u2193',
  harr: '\u2194',
  minus: '\u2212',
  lowast: '\u2217',
  radic: '\u221A',
  infin: '\u221E',
  ne: '\u2260',
  le: '\u2264',
  ge: '\u2265',
  equiv: '\u2261',
  cap: '\u2229',
  cup: '\u222A',
  int: '\u222B',
  there4: '\u2234',
  sim: '\u223C',
  asymp: '\u2248',
  sub: '\u2282',
  sup: '\u2283',
  sube: '\u2286',
  supe: '\u2287',
  oplus: '\u2295',
  otimes: '\u2297',
  perp: '\u22A5',
  sdot: '\u22C5',
  lceil: '\u2308',
  rceil: '\u2309',
  lfloor: '\u230A',
  rfloor: '\u230B',
  lang: '\u2329',
  rang: '\u232A',
  loz: '\u25CA',
  spades: '\u2660',
  clubs: '\u2663',
  hearts: '\u2665',
  diams: '\u2666',
};

// Matches `&#39;` / `&#x27;` / `&apos;` — decimal, hex, or named.
const ENTITY_RE = /&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** Decode a single entity match to its character, or return `null` if unknown. */
function decodeOne(match: string): string | null {
  const body = match.slice(1, -1); // strip leading & and trailing ;
  if (body.startsWith('#x') || body.startsWith('#X')) {
    const code = parseInt(body.slice(2), 16);
    return Number.isNaN(code) ? null : String.fromCodePoint(code);
  }
  if (body.startsWith('#')) {
    const code = parseInt(body.slice(1), 10);
    return Number.isNaN(code) ? null : String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[body] ?? null;
}

/**
 * Decode HTML entities in `text`, iterating up to `maxPasses` so that
 * double-encoded entities (`&amp;#39;`) collapse to their final character.
 * A literal `&` that is not part of a well-formed `&…;` entity is preserved.
 */
export function decodeHtmlEntities(text: string, maxPasses = 3): string {
  if (!text) return '';
  let result = text;
  for (let pass = 0; pass < maxPasses; pass++) {
    const before = result;
    result = result.replace(ENTITY_RE, (match) => decodeOne(match) ?? match);
    if (result === before) break;
  }
  return result;
}
