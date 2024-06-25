import axios from 'axios';
import { PYTHON_SERVER } from '@/src/api/python'

export const LANGS_WITH_AZURE_TRANSLATE = 'af am ar as az ba bg bn bo bs ca cs cy da de dsb dv el en es et eu fa fi fil fj fo fr ga gl gom gu ha he hi hr hsb ht hu hy id ig ikt is it iu ja ka kk km kmr kn ko ku ky ln lo lt lug lv lzh mai mg mi mk ml mn mr ms mt mww my no nb ne nl nso nya or otq pa pl prs ps pt ro ru run rw sd si sk sl sm sn so sq sr st sv sw ta te th ti tk tlh tn to tr tt ty ug uk ur uz vi xh yo yua yue zh zu'.split(' ')

/**
 * Translates text using the Bing translator service.
 * Handles text that starts with dashes by temporarily removing them to avoid errors.
 * 
 * @param {Object} params Parameters for translation
 * @param {string} params.text Text to translate
 * @param {string} params.l1Code Language code to translate to
 * @param {string} params.l2Code Language code to translate from
 * @returns {Promise<string>} Translated text
 */
export async function translateWithBing({ text, l1Code, l2Code }) {
  let initialDashes = '';

  // Handle texts starting with dashes to avoid API issues
  const dashMatch = text.match(/^(-+)/);
  if (dashMatch) {
    initialDashes = dashMatch[0];
    text = text.substring(initialDashes.length);
  }

  if (!LANGS_WITH_AZURE_TRANSLATE.includes(l2Code)) {
    console.error(`Azure Translator does not support language code '${l2Code}'.`);
    return 'Language not supported';
  }

  try {
    let response = await axios.post(`${PYTHON_SERVER}/translate`, {
      text: text,
      l1: l1Code,
      l2: l2Code,
    });

    if (response.data?.translated_text) {
      return initialDashes + response.data.translated_text;
    } else {
      throw new Error('No translated text received from the server.');
    }
  } catch (error) {
    console.error('Translation failed:', error);
    return 'Translation error';
  }
}
