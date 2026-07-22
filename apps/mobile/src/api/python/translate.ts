// @/src/api/python/translate.ts

import { API } from "@/src/api/python";

interface TranslatedText {
  translated_text: string;
}

interface TranslatedTexts {
  translated_texts: string[];
}

/**
 * Translates a single text using the POST method.
 * @param {string} text - The text to be translated.
 * @param {string} l1 - The source language code.
 * @param {string} l2 - The target language code.
 * @returns {Promise<string>} The translated text.
 * @throws {Error} If the API call fails.
 */
export const translateText = async (text: string, l1: string, l2: string): Promise<string> => {
  const response = await API.post<TranslatedText>("/translate", { text, l1, l2 });
  return response.data.translated_text;
};

/**
 * Translates a single text using the GET method.
 * @param {string} text - The text to be translated.
 * @param {string} l1 - The source language code.
 * @param {string} l2 - The target language code.
 * @returns {Promise<string>} The translated text.
 * @throws {Error} If the API call fails.
 */
export const translateTextGet = async (text: string, l1: string, l2: string): Promise<string> => {
  const response = await API.get<TranslatedText>("/translate", { params: { text, l1, l2 } });
  return response.data.translated_text;
};

/**
 * Translates an array of texts.
 * @param {string[]} texts - The array of texts to be translated.
 * @param {string} l1 - The source language code.
 * @param {string} l2 - The target language code.
 * @returns {Promise<string[]>} An array of translated texts.
 * @throws {Error} If the API call fails.
 */
export const translateTextArray = async (texts: string[], l1: string, l2: string): Promise<string[]> => {
  const response = await API.post<TranslatedTexts>("/translate_array", { texts, l1, l2 });
  return response.data.translated_texts;
};

/**
 * Translates video subtitles and saves the result.
 * @param {string} l1 - The source language code.
 * @param {string} l2 - The target language code.
 * @param {string} videoId - The ID of the video to be translated.
 * @returns {Promise<string>} A CSV string containing the translated subtitles.
 * @throws {Error} If the API call fails or if there's an issue with the translation process.
 */
export const translateVideoAndSave = async (l1: string, l2: string, videoId: string): Promise<string> => {
  const response = await API.get<string>("/translate_video_and_save", { params: { l1, l2, video_id: videoId } });
  return response.data;
};