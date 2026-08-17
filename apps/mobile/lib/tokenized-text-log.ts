/**
 * Dev-only diagnostics for TokenizedText (mobile): tree sketches, rendered
 * token dumps, the phonetics summary, and the ruby render-path log. All are
 * __DEV__-gated and logged through the GLOBAL logger (appLog), not the
 * tokenized-text domain (defaulted off). Extracted from
 * components/TokenizedText.tsx (file-size refactor).
 */

import type { LemmatizedToken } from '@langplayer/shared';
import { log as appLog } from '@/lib/logger';
import { baseCode } from '@langplayer/utils';

// Dev-only: one-time per-text component-tree sketch of the ruby/definition
// path, so the tokenized output structure can be inspected in the Metro log
// (tokens → RubyTokenSpan → per-segment RubyTexts, gloss/byeonggi/defs).
const loggedTreeTexts = new Set<string>();
/** Last ruby render-path key logged (dev-only, see render body below). */
let lastRenderPathKey = '';
/** Only log trees/tokens whose reading has at least this many syllables —
 *  word-level pinyin long enough to trigger the Core Text distribution issue. */
const LONG_READING_MIN_SYLLABLES = 6;

/** One-time per-text component-tree sketch (see module comment). */
export function scheduleTreeLog(text: string, lines: string[]) {
  if (!__DEV__ || loggedTreeTexts.has(text)) return;
  const header = lines.slice(0, 2);
  const longReadingLines = lines.filter((line) => {
    const match = line.match(/syllables=(\d+)/);
    return match != null && Number(match[1]) >= LONG_READING_MIN_SYLLABLES;
  });
  if (longReadingLines.length === 0) return;
  loggedTreeTexts.add(text);
  setTimeout(() => {
    appLog(`[TokenizedText] 🌳 tokenized component tree text="${text.slice(0, 80)}"`);
    for (const line of [...header, ...longReadingLines]) appLog(`[TokenizedText] 🌳 ${line}`);
  }, 0);
}

// Dev-only: log each rendered line's token structure once per text, in the
// compact { word, lemma, pronunciation } shape, so the exact tokens handed to
// the render path can be inspected in the Metro log.
const loggedRenderedTokenTexts = new Set<string>();

/** One-time dump of the rendered tokens with long readings (see above). */
export function logRenderedTokens(displayTokens: LemmatizedToken[], l2Code: string, text: string) {
  if (!__DEV__ || displayTokens.length === 0) return;
  const key = `${l2Code}:${text}`;
  const longTokens = displayTokens.filter((token) => {
    const syllables = (token.pronunciation ?? '').split(' ').filter(Boolean).length;
    return syllables >= LONG_READING_MIN_SYLLABLES;
  });
  if (longTokens.length === 0 || loggedRenderedTokenTexts.has(key)) return;
  loggedRenderedTokenTexts.add(key);
  const structure = longTokens.map((token) => ({
    word: token.text,
    lemma: token.lemmas[0]?.lemma ?? null,
    pronunciation: token.pronunciation ?? null,
  }));
  appLog(
    `[TokenizedText] 🧩 RENDERED-TOKENS (long) l2=${l2Code} text="${text.slice(0, 80)}" ${JSON.stringify(structure)}`,
  );
}

export interface PhoneticsSummaryInput {
  tokens: LemmatizedToken[];
  l2Code: string;
  showPhonetics: boolean;
  phoneticsShow: string | false;
  phoneticsConditions: string;
  userLevel: number | undefined;
  shouldShowPhonetics: (token: LemmatizedToken) => boolean;
}

/**
 * Phonetics debug summary (Japanese/Korean) — why is ruby/romanization
 * missing? Logged through the GLOBAL logger (appLog), not the
 * tokenized-text domain: defaultOff('tokenized-text') silences that domain
 * unless EXPO_PUBLIC_LOG_LEVEL_TOKENIZED_TEXT=3 is set, which made this
 * summary invisible by default.
 */
export function logPhoneticsSummary(input: PhoneticsSummaryInput) {
  const { tokens, l2Code, showPhonetics, phoneticsShow, phoneticsConditions, userLevel, shouldShowPhonetics } = input;
  const base = baseCode(l2Code);
  if (!__DEV__ || (base !== 'ko' && base !== 'ja') || tokens.length === 0) return;
  const words = tokens.filter((t) => t.lemmas.length > 0);
  const withPron = words.filter((t) => t.pronunciation).length;
  const pronEqWord = words.filter((t) => t.pronunciation && t.pronunciation === t.text).length;
  const eligible = words.filter(shouldShowPhonetics).length;
  const rubyShown = words.filter(
    (t) =>
      showPhonetics &&
      phoneticsShow === 'ruby' &&
      shouldShowPhonetics(t) &&
      !!t.pronunciation &&
      t.pronunciation !== t.text,
  ).length;
  appLog(
    `[TokenizedText] 🎙 PHONETICS l2=${l2Code} show=${String(phoneticsShow)} conditions=${phoneticsConditions} userLevel=${userLevel ?? 'none'} words=${words.length} eligible=${eligible} withPron=${withPron} pronEqWord=${pronEqWord} rubyShown=${rubyShown} sample=${words.slice(0, 10).map((t) => `${t.text}→${t.pronunciation ?? '∅'}`).join(', ')}`,
  );
}

/**
 * One-shot ruby render-path log: which path this build actually takes
 * (native paragraph / native per-token / JS fallback). Logs once per change.
 */
export function logRubyRenderPath(
  nativeActive: boolean,
  paragraphActive: boolean,
  paragraphUsed: boolean,
  showDefinition: boolean,
  rubyMode: boolean,
) {
  const renderPathKey = `${nativeActive}:${paragraphActive}:${paragraphUsed}:${showDefinition}:${rubyMode}`;
  if (!__DEV__ || lastRenderPathKey === renderPathKey) return;
  lastRenderPathKey = renderPathKey;
  appLog(
    `[TokenizedText] 🧭 ruby render-path native=${nativeActive} paragraphView=${paragraphActive} paragraphUsed=${paragraphUsed} showDefinition=${showDefinition} rubyMode=${rubyMode}`,
  );
}
