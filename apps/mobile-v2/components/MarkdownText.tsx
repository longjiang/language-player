import React from 'react';
import { Text } from 'react-native';
import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

interface MarkdownTextProps {
  children: string;
}

function hasTokens(t: Token): t is Token & { tokens: Token[] } {
  return 'tokens' in t && Array.isArray((t as any).tokens);
}

export function MarkdownText({ children }: MarkdownTextProps) {
  const tokens = marked.lexer(children);

  return (
    <Text className="text-foreground">
      {tokens.map((token, i) => {
        if (token.type === 'paragraph' && hasTokens(token)) {
          return <Text key={i}>{renderInline(token.tokens)}</Text>;
        }
        if (token.type === 'heading' && hasTokens(token)) {
          const h = token as Tokens.Heading;
          const s = h.depth === 1 ? 'text-lg' : h.depth === 2 ? 'text-base' : 'text-sm';
          return <Text key={i} className={`font-bold ${s} text-foreground`}>{renderInline(h.tokens)}</Text>;
        }
        if (token.type === 'list') {
          const list = token as Tokens.List;
          return (
            <React.Fragment key={i}>
              {list.items.map((item, j) => (
                <Text key={j} className="text-foreground">{'  • '}{renderInline(item.tokens ?? [])}</Text>
              ))}
            </React.Fragment>
          );
        }
        if (token.type === 'blockquote' && hasTokens(token)) {
          return <Text key={i} className="italic text-muted-foreground">{renderInline(token.tokens)}</Text>;
        }
        if (token.type === 'code') {
          return <Text key={i} className="font-mono text-xs text-foreground">{(token as Tokens.Code).text}</Text>;
        }
        if (hasTokens(token)) {
          return <Text key={i}>{renderInline(token.tokens)}</Text>;
        }
        return <Text key={i}>{'text' in token ? (token as any).text : ''}</Text>;
      })}
    </Text>
  );

  function renderInline(tokens: Token[]): React.ReactNode {
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
        return (tok as Tokens.Text).text as string;
      }
      if (tok.type === 'space') {
        return ' ';
      }
      if (hasTokens(tok)) {
        return <Text key={i}>{renderInline(tok.tokens)}</Text>;
      }
      return null;
    });
  }
}
