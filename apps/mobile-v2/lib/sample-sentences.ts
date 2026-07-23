const SAMPLES: Record<string, string> = {
  zh: '好好学习，天天向上。',
  yue: '我哋一齊學廣東話。',
  ja: '毎日少しずつ日本語を勉強しています。',
  ko: '매일 조금씩 한국어를 공부하고 있어요.',
  en: 'The quick brown fox jumps over the lazy dog.',
  fr: 'Le renard brun rapide saute par-dessus le chien paresseux.',
  de: 'Der schnelle braune Fuchs springt über den faulen Hund.',
  es: 'El rápido zorro marrón salta sobre el perro perezoso.',
  it: 'La volpe marrone veloce salta sopra il cane pigro.',
  pt: 'A rápida raposa castanha salta sobre o cão preguiçoso.',
  ru: 'Быстрая коричневая лиса прыгает через ленивую собаку.',
  nl: 'De snelle bruine vos springt over de luie hond.',
  vi: 'Con cáo nâu nhanh nhẹn nhảy qua con chó lười biếng.',
};

const FALLBACK = 'Lorem ipsum dolor sit amet consectetur adipiscing elit.';

export function getSampleSentence(code: string): string {
  return SAMPLES[code] ?? FALLBACK;
}
