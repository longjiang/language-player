import React from 'react';
import { View, Text } from 'react-native';
import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

interface MarkdownTextProps {
  children: string;
}

function hasTokens(t: Token): t is Token & { tokens: Token[] } {
  return 'tokens' in t && Array.isArray((t as any).tokens);
}

/**
 * Renders markdown as nicely formatted text using full marked lexing.
 * Block-level elements (paragraphs, headings, lists, blockquotes, code)
 * are wrapped in <View> with proper spacing. Inline elements (bold, italic,
 * codespan, links) render inside <Text> for seamless flow.
 */
export function MarkdownText({ children }: MarkdownTextProps) {
  const tokens = marked.lexer(children);

  return (
    <View>
      {tokens.map((token, i) => {
        if (token.type === 'paragraph' && hasTokens(token)) {
          return (
            <Text key={i} className="mb-3 leading-snug text-foreground">
              {renderInline(token.tokens)}
            </Text>
          );
        }
        if (token.type === 'heading' && hasTokens(token)) {
          const h = token as Tokens.Heading;
          const sizeClass = h.depth === 1 ? 'text-lg' : h.depth === 2 ? 'text-base' : 'text-sm';
          const mb = h.depth === 1 ? 'mb-2' : h.depth === 2 ? 'mb-1' : 'mb-1';
          return (
            <Text key={i} className={`font-bold ${sizeClass} ${mb} leading-snug text-foreground`}>
              {renderInline(h.tokens)}
            </Text>
          );
        }
        if (token.type === 'list') {
          const list = token as Tokens.List;
          return (
            <View key={i} className="mb-3">
              {list.items.map((item, j) => (
                <View key={j} className="flex-row">
                  <Text className="mr-2 text-sm leading-snug text-muted-foreground">{list.ordered ? `${j + 1}.` : '•'}</Text>
                  <View className="flex-1">
                    {item.tokens && hasTokens(item) ? (
                      <Text className="leading-snug text-foreground">{renderInline(item.tokens)}</Text>
                    ) : (
                      <Text className="leading-snug text-foreground">{item.text}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          );
        }
        if (token.type === 'blockquote' && hasTokens(token)) {
          return (
            <View key={i} className="mb-3 border-l-2 border-muted-foreground/30 pl-3">
              <Text className="italic leading-snug text-muted-foreground">
                {renderInline(token.tokens)}
              </Text>
            </View>
          );
        }
        if (token.type === 'code') {
          const code = token as Tokens.Code;
          return (
            <View key={i} className="mb-3 rounded-lg bg-muted/40 px-3 py-2">
              <Text className="font-mono text-xs leading-relaxed text-foreground">{code.text}</Text>
            </View>
          );
        }
        if (token.type === 'hr') {
          return <View key={i} className="mb-3 h-px bg-border" />;
        }
        if (hasTokens(token)) {
          return (
            <Text key={i} className="mb-3 leading-snug text-foreground">
              {renderInline(token.tokens)}
            </Text>
          );
        }
        return null;
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
        return (
          <Text key={i} className="rounded bg-muted/60 px-1 font-mono text-xs text-foreground">
            {(tok as Tokens.Codespan).text}
          </Text>
        );
      }
      if (tok.type === 'link' && hasTokens(tok)) {
        const link = tok as Tokens.Link;
        return (
          <Text key={i} className="text-primary underline">
            {renderInline(link.tokens)}
          </Text>
        );
      }
      if (tok.type === 'text') {
        const text = tok as Tokens.Text;
        return <Text key={i}>{text.text as string}</Text>;
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
