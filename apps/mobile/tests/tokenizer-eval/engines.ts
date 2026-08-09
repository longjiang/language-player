/**
 * SPEC-058 Node adapters for the kuromoji engines.
 *
 * The app uses custom React Native loaders (expo-file-system); under Node the
 * stock builders work with the fixture pack directories (see setup.ts for the
 * `require`/fetch shims kuromoji-ko needs).
 */
import kuromoji from 'kuromoji';
import kuromojiKo from 'kuromoji-ko';

export function loadKuromojiForEval(dicPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err: Error | null, tokenizer: any) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

export async function loadKuromojiKoForEval(dicPath: string): Promise<any> {
  return kuromojiKo.builder({ dicPath }).build();
}
