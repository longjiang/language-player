import { addSpaceTokens } from './tokenizer-utils';
import { Token } from '@/types/tokenTypes';
import { isHangul } from '@/src/utils';


export const normalizeTokens = (tokens: Token[], text: string): Token[] => {
  let normalizedTokens: Token[] = [];
  let currentPosition = 0;

  for (let token of tokens) {
      if (!token) {
          normalizedTokens.push({ text: " ", pos: 'punc' });
          continue;
      }

      const position = text.indexOf(token.text, currentPosition);

      if (position > currentPosition) {
          normalizedTokens.push({ text: " ", pos: 'punc' });
      }

      if (['Punctuation', 'Foreign'].includes(token.pos) && !isHangul(token.text)) {
          normalizedTokens.push({ text: token.text, pos: 'punc' });
      } else {
          if (token.stem) {
              token.lemmas = [{ lemma: token.stem, pos: token.pos }];
          } else {
              token.lemmas = []; // Ensure lemmas are initialized even if stem is not available.
          }

          normalizedTokens.push(normalizeToken(token));
      }

      currentPosition = position + token.text.length;
  }

  if (currentPosition < text.length) {
      normalizedTokens.push({ text: " ", pos: 'punc' });
  }

  return normalizedTokens;
}

function normalizeToken(token: Token): Token {
  return {
      text: token.text,
      pos: token.pos,
      stem: token.stem,
      lemmas: token.lemmas,
  };
}

export default { normalizeTokens };
