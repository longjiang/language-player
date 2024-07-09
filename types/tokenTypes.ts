// @/types/tokenTypes

export interface Lemma {
  lemma: string;
  pos?: string;
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