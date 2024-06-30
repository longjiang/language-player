import { Token, Lemma } from '@/src/tokenizer';
import { Language } from '@/src/languages';

class TrieNode {
  children: Map<string, TrieNode>;
  isEndOfWord: boolean;

  constructor() {
      this.children = new Map();
      this.isEndOfWord = false;
  }
}

class Trie {
  root: TrieNode;

  constructor() {
      this.root = new TrieNode();
  }

  insert(word: string) {
      let currentNode = this.root;
      for (const char of word) {
          if (!currentNode.children.has(char)) {
              currentNode.children.set(char, new TrieNode());
          }
          currentNode = currentNode.children.get(char)!;
      }
      currentNode.isEndOfWord = true;
  }

  findLongestPrefix(s: string): [string, number] {
      let currentNode = this.root;
      let longestPrefix = '';
      let currentLength = 0;

      for (const char of s) {
          if (currentNode.children.has(char)) {
              currentNode = currentNode.children.get(char)!;
              longestPrefix += char;
              currentLength++;
              if (!currentNode.isEndOfWord) {
                  continue;
              }
          } else {
              break;
          }
      }

      return currentNode.isEndOfWord ? [longestPrefix, currentLength] : ['', 0];
  }

  populate(words: Set<string>) {
      for (const word of words) {
          this.insert(word);
      }
  }
}


class LocalTokenizer {
  private wordset: Set<string> | null = null;
  private trie: Trie | null = null;

  constructor(wordset?: Set<string>) {
    if (wordset) {
      this.trie = new Trie();
      this.trie.populate(wordset);
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
    if (!this.trie) {
        throw new Error("Trie not instantiated. Please provide a wordlist.");
    }

    const tokens: Token[] = [];
    let index = 0;

    while (index < text.length) {
        let subText = text.slice(index);
        const [match, length] = this.trie.findLongestPrefix(subText);
        
        if (length > 0) {
            tokens.push({ text: match, pos: 'word' });
            index += length; // Move index forward by the length of the match
        } else {
            // If no match found, treat it as a punctuation token
            tokens.push({ text: text[index], pos: 'punc' });
            index += 1;
        }
    }

    // console.log(tokens);

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
