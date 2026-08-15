import { CONTENT_L2S, type ContentL2 } from '../language-data';
import type { SampleContent } from './types';

/**
 * Per-language lazy loaders. Each `import('./xx')` is statically analyzable,
 * so web bundles split every language into its own chunk and only the
 * requested language is fetched. Mobile bundles them all (fine — it's an app
 * download). Typed as Record<ContentL2, …> so TS fails until all 110 keys
 * exist.
 */
export const sampleLoaders: Record<ContentL2, () => Promise<{ default: SampleContent }>> = {
  // ── Authored ──
  zh: () => import('./zh'),
  ja: () => import('./ja'),
  ko: () => import('./ko'),
  en: () => import('./en'),
  fr: () => import('./fr'),
  de: () => import('./de'),
  es: () => import('./es'),
  it: () => import('./it'),
  pt: () => import('./pt'),
  ru: () => import('./ru'),
  ar: () => import('./ar'),
  hi: () => import('./hi'),
  th: () => import('./th'),
  vi: () => import('./vi'),
  id: () => import('./id'),
  tr: () => import('./tr'),
  nl: () => import('./nl'),
  pl: () => import('./pl'),
  sv: () => import('./sv'),
  uk: () => import('./uk'),
  he: () => import('./he'),
  fa: () => import('./fa'),
  el: () => import('./el'),
  cs: () => import('./cs'),
  hu: () => import('./hu'),
  ro: () => import('./ro'),
  // ── Not yet authored (neutral fallback until written) ──
  af: () => import('./af'),
  am: () => import('./am'),
  ami: () => import('./_fallback'),
  as: () => import('./as'),
  ase: () => import('./ase'),
  az: () => import('./az'),
  be: () => import('./be'),
  bg: () => import('./bg'),
  bn: () => import('./bn'),
  bo: () => import('./bo'),
  br: () => import('./br'),
  ca: () => import('./ca'),
  ceb: () => import('./ceb'),
  ckb: () => import('./ckb'),
  cnr: () => import('./cnr'),
  cy: () => import('./cy'),
  da: () => import('./da'),
  eo: () => import('./eo'),
  et: () => import('./et'),
  eu: () => import('./eu'),
  fi: () => import('./fi'),
  fo: () => import('./fo'),
  ga: () => import('./ga'),
  gd: () => import('./gd'),
  gl: () => import('./gl'),
  grc: () => import('./grc'),
  gsw: () => import('./gsw'),
  gu: () => import('./gu'),
  hak: () => import('./hak'),
  hr: () => import('./hr'),
  hsh: () => import('./hsh'),
  hy: () => import('./hy'),
  ins: () => import('./ins'),
  is: () => import('./is'),
  jv: () => import('./jv'),
  ka: () => import('./ka'),
  kac: () => import('./_fallback'),
  kk: () => import('./kk'),
  km: () => import('./km'),
  kn: () => import('./kn'),
  ku: () => import('./ku'),
  ky: () => import('./ky'),
  la: () => import('./la'),
  lb: () => import('./lb'),
  lo: () => import('./lo'),
  lt: () => import('./lt'),
  lv: () => import('./lv'),
  lzh: () => import('./lzh'),
  mg: () => import('./mg'),
  mi: () => import('./mi'),
  mk: () => import('./mk'),
  ml: () => import('./ml'),
  mn: () => import('./mn'),
  mr: () => import('./mr'),
  ms: () => import('./ms'),
  mt: () => import('./mt'),
  my: () => import('./my'),
  nan: () => import('./nan'),
  no: () => import('./no'),
  nsl: () => import('./nsl'),
  och: () => import('./och'),
  pa: () => import('./pa'),
  qu: () => import('./qu'),
  sa: () => import('./sa'),
  si: () => import('./si'),
  sk: () => import('./sk'),
  sl: () => import('./sl'),
  sm: () => import('./sm'),
  so: () => import('./so'),
  sq: () => import('./sq'),
  sr: () => import('./sr'),
  su: () => import('./su'),
  svk: () => import('./svk'),
  sw: () => import('./sw'),
  ta: () => import('./ta'),
  te: () => import('./te'),
  tl: () => import('./tl'),
  tlh: () => import('./tlh'),
  tt: () => import('./tt'),
  ur: () => import('./ur'),
  uz: () => import('./uz'),
  wo: () => import('./wo'),
  yo: () => import('./yo'),
  yue: () => import('./yue'),
};

// Runtime completeness guard — CONTENT_L2S is typed as readonly string[], so
// the Record can't enforce the 110 keys at compile time. Fail fast if the map
// ever drifts from the canonical list (caught immediately in dev and CI).
{
  const loaderCodes = new Set(Object.keys(sampleLoaders));
  const missing = CONTENT_L2S.filter((code) => !loaderCodes.has(code));
  const extra = [...loaderCodes].filter((code) => !CONTENT_L2S.includes(code));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Sample loader map out of sync — missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    );
  }
}

/** Load the sample content for a language code (zh-Hans → zh). */
export async function loadSampleContent(code: string): Promise<SampleContent> {
  const base = code.split('-')[0]!;
  const loader = sampleLoaders[base as ContentL2] ?? sampleLoaders.en!;
  return (await loader()).default;
}

/** Short ~50-word paragraph for the settings preview. */
export async function loadSampleShort(code: string): Promise<string> {
  return (await loadSampleContent(code)).short;
}

/** Long reader text; falls back to the short paragraph when not authored. */
export async function loadSampleLong(code: string): Promise<string> {
  const content = await loadSampleContent(code);
  return content.long ?? content.short;
}
