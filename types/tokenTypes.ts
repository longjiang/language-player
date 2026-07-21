// @/types/tokenTypes

export interface Lemma {
  lemma: string;
  /** Part of speech (e.g. 'noun', 'verb', 'adj-i'). Aligned with @langplayer/shared. */
  part_of_speech?: string;
  /** Morphological breakdown (e.g. Turkish morphemes). GO-specific, not in shared Lemma. */
  morphologies?: string[];
}

export interface Token {
  text: string;
  pos?: string;
  stem?: string;
  lemmas?: Lemma[];
  pronunciation?: string;
}

export interface TokenizerModule {
  normalizeTokens: (tokens: Token[], text: string) => Token[];
}

export interface Tokenizer {
  name: string;
  module: TokenizerModule,
  endPoint: string;
  languages: string[];
}