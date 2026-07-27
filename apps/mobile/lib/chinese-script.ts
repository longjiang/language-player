/**
 * Simplified ↔ Traditional Chinese conversion via OpenCC.
 *
 * Uses opencc-js (pure JavaScript, ~250KB gzipped) — lazy-loaded at module
 * level so the dictionary is only fetched when a Chinese video is watched.
 * After the first load, conversion is synchronous (the converter function
 * is cached).
 *
 * Mirrors apps/web/src/lib/chinese-script.ts for architecture consistency.
 */

type ChineseConverter = (text: string) => string;

let cn2tPromise: Promise<ChineseConverter> | null = null;
let t2cnPromise: Promise<ChineseConverter> | null = null;
let cn2tCached: ChineseConverter | null = null;
let t2cnCached: ChineseConverter | null = null;

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

/**
 * Get the raw Simplified→Traditional converter function.
 * Loads OpenCC on first call (async), returns cached function on subsequent calls.
 * The returned function is synchronous — useful for batch conversion without
 * per-call Promise overhead.
 */
export async function getConverter(): Promise<ChineseConverter> {
  if (!cn2tCached) {
    cn2tCached = await loadCn2t();
  }
  return cn2tCached;
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
