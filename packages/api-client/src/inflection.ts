import { apiClient } from './client';
import type { InflectedForm } from '@langplayer/shared';

/**
 * Hook for accessing word inflection/conjugation endpoints.
 *
 * Calls the Python backend's language-specific inflectors:
 *   - /inflect-japanese  (godan/ichidan verbs + i-adjectives)
 *   - /inflect-korean    (6 irregular types + 36 conjugation forms)
 *   - /inflect-pattern   (en, it, de, es, fr, nl via pattern library)
 *   - /inflect-pymorphy  (rus, ukr via pymorphy2)
 *
 * All endpoints return the same InflectedForm[] shape:
 *   [{ table: "conjugation", field: "polite affirmative", form: "食べます" }]
 */
export function useInflection() {
  return {
    /**
     * Get all conjugation forms for a Japanese verb or adjective.
     *
     * @param lemma  Dictionary form (e.g., "食べる", "動く", "する", "高い").
     * @param verbType  Optional: "v1" for ichidan verbs. Defaults to godan detection.
     *                  Only needed for る-ending verbs where ambiguity exists
     *                  (e.g., 食べる="v1" vs 作る=godan).
     */
    japanese: (lemma: string, verbType?: 'v1') =>
      apiClient.get<InflectedForm[]>('/inflect-japanese', {
        params: { text: lemma, lang: 'jpn', ...(verbType ? { verb_type: verbType } : {}) },
      }),

    /**
     * Get all conjugation forms for a Korean verb.
     *
     * @param lemma  Dictionary form ending in 다 (e.g., "먹다", "돕다", "하다").
     */
    korean: (lemma: string) =>
      apiClient.get<InflectedForm[]>('/inflect-korean', {
        params: { text: lemma, lang: 'kor' },
      }),

    /**
     * Get all conjugation forms via the pattern library (European languages).
     *
     * @param lemma  Dictionary form (e.g., "go", "parlare", "sein").
     * @param lang   ISO 639-3 language code (e.g., "eng", "ita", "deu", "spa", "fra", "nld").
     */
    pattern: (lemma: string, lang: string) =>
      apiClient.get<InflectedForm[]>('/inflect-pattern', {
        params: { text: lemma, lang },
      }),

    /**
     * Get all conjugation forms via pymorphy2 (Russian, Ukrainian).
     *
     * @param lemma  Dictionary form (e.g., "идти", "йти").
     * @param lang   ISO 639-3 language code ("rus" or "ukr").
     */
    pymorphy: (lemma: string, lang: string) =>
      apiClient.get<InflectedForm[]>('/inflect-pymorphy', {
        params: { text: lemma, lang },
      }),
  };
}
