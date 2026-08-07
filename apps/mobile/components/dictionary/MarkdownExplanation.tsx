import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { TokenizedText } from '@/components/TokenizedText';

interface MarkdownExplanationProps {
  /** Markdown text to render (the AI explanation response). */
  text: string;
  /** Target language code — backticked L2 spans are tokenized against this. */
  l2Code: string;
  /** True while the response is still streaming: backticked spans render as
   *  plain code and tokenization is deferred until the stream ends. */
  streaming?: boolean;
}

/**
 * Renders an AI explanation in two phases (mirrors web MarkdownExplanation):
 *   1. streaming — plain formatted text, no tokenization (backticked L2 spans
 *      show as regular inline code);
 *   2. finished — the text is re-rendered and backticked L2 spans are swapped
 *      for interactive TokenizedText (tappable → dictionary popup), bold,
 *      without a chip background.
 *
 * The AI prompt (prompt.explain_ticks) instructs the model to wrap every L2
 * word/phrase/sentence in single backticks so these spans can be tokenized.
 */
export function MarkdownExplanation({ text, l2Code, streaming = false }: MarkdownExplanationProps) {
  // Split the text into lines, then into segments of [plain | backticked].
  // While streaming, render everything as plain text (monospace for ticks).
  const lines = useMemo(() => {
    if (!text) return [];
    return text.split(/\n+/).filter((line) => line.trim().length > 0);
  }, [text]);

  if (!text) return null;

  if (streaming) {
    return (
      <View>
        {lines.map((line, i) => (
          <Text key={i} className="text-sm leading-relaxed text-foreground">
            {line}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View>
      {lines.map((line, i) => (
        <Line key={i} line={line} l2Code={l2Code} />
      ))}
    </View>
  );
}

function Line({ line, l2Code }: { line: string; l2Code: string }) {
  // Split on backtick-delimited spans: text `l2` more text.
  const parts = useMemo(() => {
    const out: { code: boolean; value: string }[] = [];
    const re = /`([^`]+)`/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) out.push({ code: false, value: line.slice(last, m.index) });
      out.push({ code: true, value: m[1]! });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ code: false, value: line.slice(last) });
    return out;
  }, [line]);

  return (
    <View className="flex-row flex-wrap items-baseline">
      {parts.map((part, i) => {
        if (part.code) {
          // Interactive tokenized L2 span — bold, no chip background.
          return (
            <View key={i} className="flex-row items-baseline">
              <TokenizedText text={part.value} l2Code={l2Code} leading="loose" phonetics={false} />
            </View>
          );
        }
        return <InlineMarkdown key={i} text={part.value} />;
      })}
    </View>
  );
}

/** Minimal inline markdown: **bold** and *italic* within a plain segment. */
function InlineMarkdown({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { bold: boolean; italic: boolean; value: string }[] = [];
    // Split by **bold** first, then handle *italic* inside.
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        for (const piece of splitItalic(text.slice(last, m.index))) out.push(piece);
      }
      for (const piece of splitItalic(m[1]!)) out.push({ ...piece, bold: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      for (const piece of splitItalic(text.slice(last))) out.push(piece);
    }
    return out;
  }, [text]);

  return (
    <>
      {parts.map((part, i) => (
        <Text
          key={i}
          className={`text-foreground ${part.bold ? 'font-bold' : ''} ${part.italic ? 'italic' : ''}`}
          style={{ fontSize: 16, lineHeight: 32 }}
        >
          {part.value}
        </Text>
      ))}
    </>
  );
}

function splitItalic(text: string): { bold: boolean; italic: boolean; value: string }[] {
  const out: { bold: boolean; italic: boolean; value: string }[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ bold: false, italic: false, value: text.slice(last, m.index) });
    out.push({ bold: false, italic: true, value: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ bold: false, italic: false, value: text.slice(last) });
  return out;
}
