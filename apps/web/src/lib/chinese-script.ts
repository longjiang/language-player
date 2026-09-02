/**
 * Simplified ↔ Traditional Chinese conversion.
 * Uses OpenCC (lazy-loaded, ~250KB gzipped) — only loaded when needed.
 *
 * Presets are the SCRIPT-LEVEL ones (`t` ↔ `cn`), not the TW/HK locale
 * presets (`twp`/`tw`/`hk`). Locale presets apply phrase normalization
 * BEFORE script conversion, which corrupts already-simplified input:
 * the twp normalization table maps standalone/word-final 么 → 幺 (the TW
 * dictionary form), so 什么 → 什幺, 么 → 幺 (verified in opencc-js 1.4.1;
 * 2026-09). They also localize vocabulary (滑鼠 → 鼠标, 軟體 → 软件),
 * replacing the word actually spoken in the audio. The generic `t`
 * presets are idempotent in both directions (verified across all CJK
 * codepoints U+3400–9FFF, U+F900–FAFF) and match the Classic app's
 * chinese-conv behavior — see ADR-0019.
 */

type ChineseConverter = (text: string) => string;

let cn2tPromise: Promise<ChineseConverter> | null = null;
let t2cnPromise: Promise<ChineseConverter> | null = null;

async function loadCn2t(): Promise<ChineseConverter> {
  if (!cn2tPromise) {
    cn2tPromise = import('opencc-js').then(({ Converter }) =>
      (Converter as any)({ from: 'cn', to: 't' }),
    );
  }
  return cn2tPromise;
}

async function loadT2cn(): Promise<ChineseConverter> {
  if (!t2cnPromise) {
    t2cnPromise = import('opencc-js').then(({ Converter }) =>
      (Converter as any)({ from: 't', to: 'cn' }),
    );
  }
  return t2cnPromise;
}

/** Convert Simplified Chinese text to Traditional. Idempotent on already-traditional text. */
export async function toTraditional(text: string): Promise<string> {
  const converter = await loadCn2t();
  return converter(text);
}

/** Convert Traditional Chinese text to Simplified. Idempotent on already-simplified text. */
export async function toSimplified(text: string): Promise<string> {
  const converter = await loadT2cn();
  return converter(text);
}
