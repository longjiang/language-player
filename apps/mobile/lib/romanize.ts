/**
 * Offline romanization for non-Latin script languages.
 *
 * Parity source: `zerotohero-python-server/romanize.py`. The character
 * maps below are ported 1:1 from the server so offline output is
 * byte-identical to the online API:
 *
 *   ko, kor — Revised Romanization via `koroman` (npm). The server uses
 *             the same codebase published to PyPI (koroman==1.0.16), so
 *             online/offline Korean romanization stays in lockstep.
 *   ru, bg, uk — Cyrillic → Latin char maps (ISO 9 with readability
 *             adjustments; Bulgarian ъ→a, щ→sht; Ukrainian-specific letters).
 *   el, ell — Greek → Latin (ISO 843, accents stripped).
 *   hy, hye — Armenian → Latin (ISO 9985).
 *   ka — Georgian → Latin (ISO 9984, Mkhedruli + Mtavruli).
 *
 * Languages without a romanizer here (zh/ja/ar/fa/th/…) keep their
 * engine-specific pronunciation (pinyin, katakana, …) or none.
 */
import { romanize as romanizeKorean } from 'koroman';

// ── Cyrillic → Latin (Russian, ISO 9 with readability adjustments) ──

const RU_MAP: Record<string, string> = {
  'А': 'A', 'а': 'a', 'Б': 'B', 'б': 'b', 'В': 'V', 'в': 'v',
  'Г': 'G', 'г': 'g', 'Д': 'D', 'д': 'd', 'Е': 'E', 'е': 'e',
  'Ё': 'Yo', 'ё': 'yo', 'Ж': 'Zh', 'ж': 'zh', 'З': 'Z', 'з': 'z',
  'И': 'I', 'и': 'i', 'Й': 'Y', 'й': 'y', 'К': 'K', 'к': 'k',
  'Л': 'L', 'л': 'l', 'М': 'M', 'м': 'm', 'Н': 'N', 'н': 'n',
  'О': 'O', 'о': 'o', 'П': 'P', 'п': 'p', 'Р': 'R', 'р': 'r',
  'С': 'S', 'с': 's', 'Т': 'T', 'т': 't', 'У': 'U', 'у': 'u',
  'Ф': 'F', 'ф': 'f', 'Х': 'Kh', 'х': 'kh', 'Ц': 'Ts', 'ц': 'ts',
  'Ч': 'Ch', 'ч': 'ch', 'Ш': 'Sh', 'ш': 'sh', 'Щ': 'Shch', 'щ': 'shch',
  'Ъ': '', 'ъ': '', 'Ы': 'Y', 'ы': 'y', 'Ь': '', 'ь': '',
  'Э': 'E', 'э': 'e', 'Ю': 'Yu', 'ю': 'yu', 'Я': 'Ya', 'я': 'ya',
};

// Ukrainian-specific additions; Russian-only letters removed.
const UK_EXTRAS: Record<string, string> = {
  'Є': 'Ye', 'є': 'ye', 'І': 'I', 'і': 'i',
  'Ї': 'Yi', 'ї': 'yi', 'Ґ': 'G', 'ґ': 'g',
};
const UK_REMOVE = new Set(['Ё', 'ё', 'Ъ', 'ъ', 'Ы', 'ы', 'Э', 'э']);

// Bulgarian-specific adjustments: щ → sht (not shch), ъ → schwa.
const BG_OVERRIDES: Record<string, string> = {
  'Щ': 'Sht', 'щ': 'sht', 'Ъ': 'A', 'ъ': 'a',
};
const BG_REMOVE = new Set(['Ё', 'ё', 'Ы', 'ы', 'Э', 'э']);

const UK_MAP: Record<string, string> = { ...RU_MAP };
for (const k of UK_REMOVE) delete UK_MAP[k];
Object.assign(UK_MAP, UK_EXTRAS);

const BG_MAP: Record<string, string> = { ...RU_MAP };
for (const k of BG_REMOVE) delete BG_MAP[k];
Object.assign(BG_MAP, BG_OVERRIDES);

// ── Greek → Latin (ISO 843, accents stripped) ──────────────────────

const EL_MAP: Record<string, string> = {
  'Α': 'A', 'α': 'a', 'Β': 'V', 'β': 'v', 'Γ': 'G', 'γ': 'g',
  'Δ': 'D', 'δ': 'd', 'Ε': 'E', 'ε': 'e', 'Ζ': 'Z', 'ζ': 'z',
  'Η': 'I', 'η': 'i', 'Θ': 'Th', 'θ': 'th', 'Ι': 'I', 'ι': 'i',
  'Κ': 'K', 'κ': 'k', 'Λ': 'L', 'λ': 'l', 'Μ': 'M', 'μ': 'm',
  'Ν': 'N', 'ν': 'n', 'Ξ': 'X', 'ξ': 'x', 'Ο': 'O', 'ο': 'o',
  'Π': 'P', 'π': 'p', 'Ρ': 'R', 'ρ': 'r', 'Σ': 'S', 'σ': 's',
  'ς': 's', 'Τ': 'T', 'τ': 't', 'Υ': 'Y', 'υ': 'y',
  'Φ': 'F', 'φ': 'f', 'Χ': 'Ch', 'χ': 'ch', 'Ψ': 'Ps', 'ψ': 'ps',
  'Ω': 'O', 'ω': 'o',
  // Accented vowels — strip accents, map base
  'Ά': 'A', 'ά': 'a', 'Έ': 'E', 'έ': 'e', 'Ή': 'I', 'ή': 'i',
  'Ί': 'I', 'ί': 'i', 'Ό': 'O', 'ό': 'o', 'Ύ': 'Y', 'ύ': 'y',
  'Ώ': 'O', 'ώ': 'o', 'Ϊ': 'I', 'ϊ': 'i', 'Ϋ': 'Y', 'ϋ': 'y',
};

// ── Armenian → Latin (ISO 9985) ────────────────────────────────────

const HY_MAP: Record<string, string> = {
  'Ա': 'A', 'ա': 'a', 'Բ': 'B', 'բ': 'b', 'Գ': 'G', 'գ': 'g',
  'Դ': 'D', 'դ': 'd', 'Ե': 'E', 'ե': 'e', 'Զ': 'Z', 'զ': 'z',
  'Է': 'E', 'է': 'e', 'Ը': 'Ë', 'ը': 'ë', 'Թ': 'T\'', 'թ': 't\'',
  'Ժ': 'Ž', 'ժ': 'ž', 'Ի': 'I', 'ի': 'i', 'Լ': 'L', 'լ': 'l',
  'Խ': 'X', 'խ': 'x', 'Ծ': 'C', 'ծ': 'c', 'Կ': 'K', 'կ': 'k',
  'Հ': 'H', 'հ': 'h', 'Ձ': 'J', 'ձ': 'j', 'Ղ': 'Ġ', 'ղ': 'ġ',
  'Ճ': 'Č', 'ճ': 'č', 'Մ': 'M', 'մ': 'm', 'Յ': 'Y', 'յ': 'y',
  'Ն': 'N', 'ն': 'n', 'Շ': 'Š', 'շ': 'š', 'Ո': 'O', 'ո': 'o',
  'Չ': 'Č\'', 'չ': 'č\'', 'Պ': 'P', 'պ': 'p', 'Ջ': 'J̌', 'ջ': 'ǰ',
  'Ռ': 'Ṙ', 'ռ': 'ṙ', 'Ս': 'S', 'ս': 's', 'Վ': 'V', 'վ': 'v',
  'Տ': 'T', 'տ': 't', 'Ր': 'R', 'ր': 'r', 'Ց': 'C\'', 'ց': 'c\'',
  'Ւ': 'W', 'ւ': 'w', 'Փ': 'P\'', 'փ': 'p\'', 'Ք': 'K\'', 'ք': 'k\'',
  'և': 'ev', 'Օ': 'O', 'օ': 'o', 'Ֆ': 'F', 'ֆ': 'f',
};

// ── Georgian → Latin (ISO 9984, Mkhedruli + Mtavruli) ──────────────

const KA_MAP: Record<string, string> = {
  'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e',
  'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i', 'კ': 'k',
  'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p',
  'ჟ': 'zh', 'რ': 'r', 'ს': 's', 'ტ': 't\'', 'უ': 'u',
  'ფ': 'p\'', 'ქ': 'k\'', 'ღ': 'gh', 'ყ': 'q\'', 'შ': 'sh',
  'ჩ': 'ch', 'ც': 'ts', 'ძ': 'dz', 'წ': 'ts\'', 'ჭ': 'ch\'',
  'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h',
  // Capital forms (Mtavruli) map to the same Latin values
  'Ⴀ': 'a', 'Ⴁ': 'b', 'Ⴂ': 'g', 'Ⴃ': 'd', 'Ⴄ': 'e',
  'Ⴅ': 'v', 'Ⴆ': 'z', 'Ⴇ': 't', 'Ⴈ': 'i', 'Ⴉ': 'k',
  'Ⴊ': 'l', 'Ⴋ': 'm', 'Ⴌ': 'n', 'Ⴍ': 'o', 'Ⴎ': 'p',
  'Ⴏ': 'zh', 'Ⴐ': 'r', 'Ⴑ': 's', 'Ⴒ': 't\'', 'Ⴓ': 'u',
  'Ⴔ': 'p\'', 'Ⴕ': 'k\'', 'Ⴖ': 'gh', 'Ⴗ': 'q\'', 'Ⴘ': 'sh',
  'Ⴙ': 'ch', 'Ⴚ': 'ts', 'Ⴛ': 'dz', 'Ⴜ': 'ts\'', 'Ⴝ': 'ch\'',
  'Ⴞ': 'kh', 'Ⴟ': 'j', 'Ⴠ': 'h',
};

function romanizeCyrillic(text: string, mapping: Record<string, string>): string {
  return [...text].map((ch) => mapping[ch] ?? ch).join('');
}

function romanizeCharMap(text: string, mapping: Record<string, string>): string {
  return [...text].map((ch) => mapping[ch] ?? ch).join('');
}

// ── Public API ─────────────────────────────────────────────────────

const ROMANIZERS: Record<string, (text: string) => string> = {
  ko: romanizeKorean,
  kor: romanizeKorean,
  ru: (t) => romanizeCyrillic(t, RU_MAP),
  rus: (t) => romanizeCyrillic(t, RU_MAP),
  bg: (t) => romanizeCyrillic(t, BG_MAP),
  uk: (t) => romanizeCyrillic(t, UK_MAP),
  el: (t) => romanizeCharMap(t, EL_MAP),
  ell: (t) => romanizeCharMap(t, EL_MAP),
  hy: (t) => romanizeCharMap(t, HY_MAP),
  hye: (t) => romanizeCharMap(t, HY_MAP),
  ka: (t) => romanizeCharMap(t, KA_MAP),
};

/** Language codes (with ISO 639-3 aliases) that have an offline romanizer. */
export const ROMANIZABLE_LANGS = new Set(Object.keys(ROMANIZERS));

/**
 * Romanize `text` in language `l2`. Returns undefined when the language
 * has no offline romanizer (Latin script, Chinese/Japanese engines that
 * provide their own pronunciation, etc.).
 */
export function romanize(text: string, l2: string): string | undefined {
  const fn = ROMANIZERS[l2];
  return fn ? fn(text) : undefined;
}
