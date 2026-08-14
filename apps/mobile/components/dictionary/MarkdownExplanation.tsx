import React, { Suspense, useMemo } from 'react';
import { View, Text } from 'react-native';

// Loaded on demand to break the static require cycle:
// TokenizedText → DictionaryPopup → AiExplanation → MarkdownExplanation → TokenizedText.
// Metro warns about the cycle; lazy-loading keeps rendering synchronous after first use.
const LazyTokenizedText = React.lazy(async () => ({
  default: (await import('@/components/TokenizedText')).TokenizedText,
}));

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
 *      without a chip background. They render plain: no saved-word
 *      highlighting, quick gloss, byeonggi, interlinear definitions,
 *      phonetics, or quiz blanking (matches web).
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

  // One parent Text per markdown line. Plain parts and backticked spans are
  // nested Text children, so the native text engine lays them out inline like
  // web's <span> and wraps naturally at the container edge. The previous
  // implementation put the token span in a nested flex-row View, which on
  // device (RN 0.86) measures a wrapping Text as a single-line block and
  // forces every following plain part onto a new line.
  return (
    <Text className="text-foreground" style={{ fontSize: 16, lineHeight: 32 }}>
      {parts.map((part, i) => {
        if (part.code) {
          // Interactive tokenized L2 span — bold, no chip background.
          return (
            <Suspense key={i} fallback={<Text className="text-foreground">{part.value}</Text>}>
              <LazyTokenizedText
                text={part.value}
                l2Code={l2Code}
                inline
                phonetics={false}
                highlightSaved={false}
                quickGloss={false}
                showDefinition={false}
                byeonggi={false}
                mode="normal"
                bold
              />
            </Suspense>
          );
        }
        return <InlineMarkdown key={i} text={part.value} />;
      })}
    </Text>
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
          className={`${part.bold ? 'font-bold' : ''} ${part.italic ? 'italic' : ''}`}
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
