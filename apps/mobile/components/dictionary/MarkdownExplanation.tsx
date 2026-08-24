import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { parseMarkdownBlocks } from '@langplayer/shared';
import { MarkdownBlocks } from '@/components/markdown/MarkdownBlocks';

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
 *   2. finished — the text is parsed by the shared parseMarkdownBlocks
 *      (SPEC-083) and rendered through MarkdownBlocks with the
 *      `codeSpans: 'tokenize'` policy: backticked L2 spans become interactive
 *      TokenizedText (tappable → dictionary popup), bold, without a chip
 *      background. They render plain: no saved-word highlighting, quick
 *      gloss, byeonggi, interlinear definitions, phonetics, or quiz
 *      blanking (matches web). Headings, lists, tables, code blocks, and
 *      bold now render like the readers/docs instead of raw markers.
 *
 * The AI prompt (prompt.explain_ticks) instructs the model to wrap every L2
 * word/phrase/sentence in single backticks so these spans can be tokenized.
 */
export function MarkdownExplanation({ text, l2Code, streaming = false }: MarkdownExplanationProps) {
  // Split the text into lines for the streaming phase.
  const lines = useMemo(() => {
    if (!text) return [];
    return text.split(/\n+/).filter((line) => line.trim().length > 0);
  }, [text]);

  // Parse once when the stream finishes (kept separate from the streaming
  // render so tokens don't re-parse on every streamed chunk).
  const blocks = useMemo(() => (streaming ? [] : parseMarkdownBlocks(text)), [text, streaming]);

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

  // The finished render must keep the streaming phase's body typography
  // (`text-sm leading-relaxed` = 14px / 1.625). MarkdownBlocks defaults to
  // 16px with a 2.0 leading ratio, so passing textScale 0.875 (14/16) and
  // lineHeightScale 1.625 keeps the body text size AND leading identical
  // across the streaming → parsed transition (headings still scale up — that
  // is the point of parsing). Without this the whole body jumps noticeably
  // larger when the stream finishes (SPEC-083).
  return (
    <MarkdownBlocks
      blocks={blocks}
      l2Code={l2Code}
      codeSpans="tokenize"
      textScale={0.875}
      lineHeightScale={1.625}
    />
  );
}
