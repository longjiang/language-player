import { Token, addSpaceTokens } from '@/src/tokenizer';
import { Language } from '@/src/languages';

class LocalTokenizer {
  private wordset: Set<string> | null = null;

  constructor(wordset?: Set<string>) {
    if (wordset) {
      this.wordset = new Set(wordset);
    }
  }

  public async tokenize(text: string, l2Lang: Language): Promise<Token[]> {
    let tokens: Token[] = [];

    if (l2Lang.continua) {
      tokens = await this.tokenizeContinua(text);
    } else {
      tokens = await this.tokenizeDiscreta(text);
    }

    return tokens;
  }

  private async tokenizeContinua(text: string): Promise<Token[]> {
    if (!this.wordset) {
      throw new Error("Word set not instantiated. Please provide a wordlist.");
    }

    const tokens: Token[] = [];
    
    // Define a helper function to find the longest match in the wordlist
    const findLongestMatch = (input: string, start: number): [string, number] => {
      let longestMatch = '';
      let longestMatchLength = 0;

      for (let i = start; i < input.length; i++) {
        const candidate = input.slice(start, i + 1);
        if (this.wordset!.has(candidate) && candidate.length > longestMatchLength) {
          longestMatch = candidate;
          longestMatchLength = candidate.length;
        }
      }

      return [longestMatch, longestMatchLength];
    };

    let index = 0;

    while (index < text.length) {
      const [match, length] = findLongestMatch(text, index);
      
      if (length > 0) {
        tokens.push({ text: match, pos: 'word' });
        index += length;
      } else {
        // If no match found, treat it as a punctuation token
        tokens.push({ text: text[index], pos: 'punc' });
        index += 1;
      }
    }

    return tokens;
  }

  private async tokenizeDiscreta(text: string): Promise<Token[]> {
    const tokens: Token[] = [];
    const regex = /\w+|[^\w\s]/g;
    
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (/\w/.test(match[0])) {
        tokens.push({ text: match[0], pos: 'word' });
      } else {
        tokens.push({ text: match[0], pos: 'punct' });
      }
    }
    
    return tokens;
  }

  public static normalizeTokens(tokens: Token[], text: string): Token[] {
    return tokens.map(LocalTokenizer.normalizeToken);
  }

  private static normalizeToken(token: any): Token {
    return {
      text: token.word,
      lemmas: token.lemmas,
      pos: token.pos,
    }
  }
}

export default LocalTokenizer;
