import React from 'react';
import { Text, View } from 'react-native';
import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

interface MarkdownTextProps {
  children: string;
}

function hasTokens(t: Token): t is Token & { tokens: Token[] } {
  return 'tokens' in t && Array.isArray((t as any).tokens);
}

/**
 * Renders markdown as a series of block-level elements (View wrappers with
 * margin-bottom), so paragraphs, headings, lists, etc. don't run together
 * into one blob of text. Inline formatting (bold, italic, links) is rendered
 * via nested <Text> elements.
 */
export function MarkdownText({ children }: MarkdownTextProps) {
  const tokens = marked.lexer(children);

  return (
    <View>
      {tokens.map((token, i) => {
        if (token.type === 'paragraph' && hasTokens(token)) {
          return <View key={i} className="mb-2"><Text className="text-foreground">{renderInline(token.tokens)}</Text></View>;
        }
        if (token.type === 'heading' && hasTokens(token)) {
          const h = token as Tokens.Heading;
          const s = h.depth === 1 ? 'text-lg' : h.depth === 2 ? 'text-base' : 'text-sm';
          return <View key={i} className="mb-1"><Text className={`font-bold ${s} text-foreground`}>{renderInline(h.tokens)}</Text></View>;
        }
        if (token.type === 'list') {
          const list = token as Tokens.List;
          return (
            <View key={i} className="mb-2">
              {list.items.map((item, j) => (
                <Text key={j} className="text-foreground">{'  • '}{renderInline(item.tokens ?? [])}</Text>
              ))}
            </View>
          );
        }
        if (token.type === 'blockquote' && hasTokens(token)) {
          return <View key={i} className="mb-2"><Text className="italic text-muted-foreground">{renderInline(token.tokens)}</Text></View>;
        }
        if (token.type === 'code') {
          const code = token as Tokens.Code;
          return <View key={i} className="mb-2"><Text className="font-mono text-xs text-foreground">{code.text}</Text></View>;
        }
        if (token.type === 'space') {
          return <View key={i} className="h-2" />;
        }
        if (hasTokens(token)) {
          return <View key={i} className="mb-2"><Text className="text-foreground">{renderInline(token.tokens)}</Text></View>;
        }
        return <View key={i} className="mb-2"><Text className="text-foreground">{'text' in token ? (token as any).text : ''}</Text></View>;
      })}
    </View>
  );

  function renderInline(tokens: Token[]) {
    return tokens.map((tok, i) => {
      if (tok.type === 'strong' && hasTokens(tok)) {
        return <Text key={i} className="font-bold">{renderInline(tok.tokens)}</Text>;
      }
      if (tok.type === 'em' && hasTokens(tok)) {
        return <Text key={i} className="italic">{renderInline(tok.tokens)}</Text>;
      }
      if (tok.type === 'codespan') {
        return <Text key={i} className="font-mono text-xs">{(tok as Tokens.Codespan).text}</Text>;
      }
      if (tok.type === 'link' && hasTokens(tok)) {
        return <Text key={i} className="text-primary underline">{renderInline(tok.tokens)}</Text>;
      }
      if (tok.type === 'text') {
        return <Text key={i}>{(tok as Tokens.Text).text as string}</Text>;
      }
      if (tok.type === 'space') {
        return <Text key={i}> </Text>;
      }
      if (hasTokens(tok)) {
        return <Text key={i}>{renderInline(tok.tokens)}</Text>;
      }
      return null;
    });
  }
}
