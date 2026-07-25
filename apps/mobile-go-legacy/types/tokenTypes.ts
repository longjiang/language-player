// @/types/tokenTypes
//
// Canonical token types from @langplayer/shared.
// GO-specific extensions: Lemma.morphologies, Token (deprecated compat alias).

export type {
  LemmatizedToken,
  LemmatizeResponse,
  TokenizerModule,
  Tokenizer,
} from '@langplayer/shared';

import type { Lemma as SharedLemma, LemmatizedToken as SharedToken } from '@langplayer/shared';

/** GO-specific Lemma extension: adds morphological analysis (Turkish/Russian). */
export interface Lemma extends SharedLemma {
  morphologies?: string[];
}

/** @deprecated Use LemmatizedToken. Kept for backward compat during migration. */
export interface Token extends Omit<SharedToken, 'lemmas'> {
  /** @deprecated Use lemmas[0]?.part_of_speech */
  pos?: string;
  /** @deprecated Use lemmas[0]?.lemma */
  stem?: string;
  lemmas?: Lemma[];
}