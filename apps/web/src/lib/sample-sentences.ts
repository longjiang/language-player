/**
 * Sample sentences for the tokenized text preview in settings.
 *
 * Each entry is a natural sentence in the target language (L2) that
 * demonstrates the language's script and is suitable for showing
 * phonetics, glosses, and definitions in the preview area.
 *
 * TODO: expand coverage to all 60+ supported languages.
 */

const SAMPLES: Record<string, string> = {
  // Chinese
  zh: '好好学习，天天向上。',
  yue: '我哋一齊學廣東話。',

  // Japanese
  ja: '毎日少しずつ日本語を勉強しています。',

  // Korean
  ko: '매일 조금씩 한국어를 공부하고 있어요.',

  // European
  en: 'The quick brown fox jumps over the lazy dog.',
  fr: 'Le renard brun rapide saute par-dessus le chien paresseux.',
  de: 'Der schnelle braune Fuchs springt über den faulen Hund.',
  es: 'El rápido zorro marrón salta sobre el perro perezoso.',
  it: 'La volpe marrone veloce salta sopra il cane pigro.',
  pt: 'A rápida raposa castanha salta sobre o cão preguiçoso.',
  ru: 'Быстрая коричневая лиса прыгает через ленивую собаку.',
  nl: 'De snelle bruine vos springt over de luie hond.',
  sv: 'Den snabba bruna räven hoppar över den lata hunden.',
  no: 'Den raske brune reven hopper over den late hunden.',
  da: 'Den hurtige brune ræv springer over den dovne hund.',
  fi: 'Nopea ruskea kettu hyppää laiskan koiran yli.',
  pl: 'Szybki brązowy lis przeskakuje nad leniwym psem.',
  cs: 'Rychlá hnědá liška skáče přes líného psa.',
  el: 'Η γρήγορη καφέ αλεπού πηδά πάνω από το τεμπέλικο σκυλί.',
  hu: 'A gyors barna róka átugrik a lusta kutya fölött.',
  ro: 'Vulpea maro rapidă sare peste câinele leneș.',
  tr: 'Hızlı kahverengi tilki tembel köpeğin üzerinden atlar.',
  uk: 'Швидка коричнева лисиця стрибає через ледачого собаку.',
  ca: 'La guineu marró ràpida salta sobre el gos mandrós.',
  ga: 'Léimeann an sionnach donn tapa thar an madra leisciúil.',
  hr: 'Brza smeđa lisica preskače lijenog psa.',
  sr: 'Брза смеђа лисица прескаче лењог пса.',

  // Asian
  vi: 'Con cáo nâu nhanh nhẹn nhảy qua con chó lười biếng.',
  th: 'สุนัขจิ้งจอกสีน้ำตาลกระโดดข้ามสุนัขขี้เกียจ',
  hi: 'तेज़ भूरी लोमड़ी आलसी कुत्ते के ऊपर कूदती है।',
  id: 'Rubah cokelat cepat melompati anjing yang malas.',
  ms: 'Musang coklat pantas melompat ke atas anjing yang malas.',

  // Middle Eastern / African
  ar: 'الثعلب البني السريع يقفز فوق الكلب الكسول.',
  fa: 'روباه قهوه‌ای سریع از روی سگ تنبل می‌پرد.',
  sw: 'Mbweha mwepesi wa kahawia anaruka juu ya mbwa mvivu.',
  af: 'Die vinnige bruin jakkals spring oor die lui hond.',
};

/** Lorem ipsum fallback for languages without a sample sentence. */
const FALLBACK = 'Lorem ipsum dolor sit amet consectetur adipiscing elit.';

/**
 * Get a sample sentence for the given language code.
 * Falls back to Lorem ipsum if no sample is available.
 */
export function getSampleSentence(l2Code: string): string {
  return SAMPLES[l2Code] ?? FALLBACK;
}
