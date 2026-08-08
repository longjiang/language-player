/**
 * Japanese lemma cleanup — parity with the server's MeCab lemmatizer
 * (zerotohero-python-server/lemmatize_japanese.py, ARCH-016 D5).
 *
 * Both kuromoji (main-thread + WebView worker) and MeCab occasionally return
 * lemmas that need cleanup before they're usable as dictionary forms:
 *   1. '私-代名詞' style suffixes → strip everything after '-'.
 *   2. All-katakana lemma for a kanji surface (proper nouns: 葉子→ヨウコ)
 *      → the surface form IS the canonical lemma.
 */
export function cleanJapaneseLemma(surface: string, lemma: string | undefined): string {
  const base = lemma || surface;
  if (base.includes('-')) return base.split('-')[0]!;
  if (/^[\u30A0-\u30FF]+$/.test(base) && /[\u4E00-\u9FFF]/.test(surface)) {
    return surface;
  }
  return base;
}
