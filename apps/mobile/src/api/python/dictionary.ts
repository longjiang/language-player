import { API } from "@/src/api/python";
import type { DictionaryLookupResponse } from '@langplayer/shared';

/**
 * Online dictionary lookup via the Python backend.
 * Same endpoint as the Next.js web app — POST /dictionary/lookup.
 *
 * Returns normalized DictionaryEntry[] with LLM fallback for missing words
 * and LLM translation for non-English L1s.
 */
export const dictionaryLookup = async (
  text: string,
  l2: string,
  l1: string = 'en'
): Promise<DictionaryLookupResponse> => {
  const response = await API.post<DictionaryLookupResponse>("/dictionary/lookup", {
    text,
    l2,
    l1,
  });
  return response.data;
};
