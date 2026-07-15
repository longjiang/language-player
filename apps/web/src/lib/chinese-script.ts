/**
 * Simplified ↔ Traditional Chinese conversion.
 * Uses OpenCC (lazy-loaded, ~250KB gzipped) — only loaded when needed.
 */

type ChineseConverter = (text: string) => string;

let cn2tPromise: Promise<ChineseConverter> | null = null;
let t2cnPromise: Promise<ChineseConverter> | null = null;

async function loadCn2t(): Promise<ChineseConverter> {
  if (!cn2tPromise) {
    cn2tPromise = import('opencc-js').then(({ Converter }) =>
      (Converter as any)({ from: 'cn', to: 'twp' }),
    );
  }
  return cn2tPromise;
}

async function loadT2cn(): Promise<ChineseConverter> {
  if (!t2cnPromise) {
    t2cnPromise = import('opencc-js').then(({ Converter }) =>
      (Converter as any)({ from: 'twp', to: 'cn' }),
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
