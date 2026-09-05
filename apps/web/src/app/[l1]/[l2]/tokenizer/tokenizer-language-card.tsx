'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadSampleContent, type SavedWordContext } from '@langplayer/shared';
import {
  ACTION_TRIGGER_SIZE_PX,
  actionTriggerBoxPx,
  actionTriggerFontPx,
} from '@langplayer/utils';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useTextScale } from '@/hooks/use-text-scale';
import { languageName, flagEmoji } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { TextActionMenu } from '@/components/text-action-menu';
import { SentenceHighlightBlock } from '@/components/reader/sentence-highlight';
import { TokenizedText } from '@/components/tokenized-text';
import {
  PaginatedReader,
  type BlockRenderCtx,
  type ReaderPageItem,
} from '@/components/reader/paginated-reader';
import {
  blockTag,
  blockClass,
  translationClass,
} from '@/components/reader/shared-reader-styles';
import { translationFontSizeRem } from '@/lib/reader-text-size';
import { READER_DEFAULT_LEADING, readerLeadingPx } from '@/lib/reader-layout';
import { type ReaderBlock, type TextBlock, parseMarkdown } from '@/lib/parse-markdown';
import { log, logwarn } from '@/lib/logger';
import { Loader2 } from 'lucide-react';

/**
 * One language's tokenization test in the tokenizer test page.
 *
 * The card is lazy-loaded: it mounts as a placeholder and only imports the
 * language's sample chunk + mounts a `PaginatedReader` once it scrolls into
 * view (web IntersectionObserver, rootMargin 200px). Same lazy-load contract
 * as the mobile tokenizer page.
 *
 * The sample defaults to the short paragraph and switches to the long one via
 * the header's `longSample` toggle (mobile parity). Translation renders
 * side-by-side with the L2 text on md+ (and stacked below on narrow screens),
 * matching the reader (SPEC-055 note).
 */
export function TokenizerLanguageCard({
  code,
  height,
  longSample,
}: {
  code: string;
  /** Card height (px, from the page's window-aware layout). */
  height: number;
  /** Whether to show the long multi-paragraph sample (default short). */
  longSample: boolean;
}) {
  const { l1 } = useLanguage();
  const { display, tokenizedText, updateDisplay } = useSettingsContext();
  const t = useT();
  const textZoom = useTextScale();
  const ref = useRef<HTMLDivElement>(null);
  const showTranslation = display.translation;

  const [loaded, setLoaded] = useState(false);
  const [sample, setSample] = useState<{ text: string; title: string } | null>(null);

  // Lazy-load the card the first time it approaches the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          log(`tokenizer card lazy-load triggered l2=${code}`);
          setLoaded(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [code]);

  // Import the sample chunk once the card is about to be shown. Short by
  // default; the long paragraph when the toggle is on (falls back to the short
  // paragraph when the language has no long sample authored).
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    loadSampleContent(code)
      .then((c) => {
        if (!cancelled) {
          const text = longSample ? (c.long ?? c.short) : c.short;
          log(`tokenizer card sample loaded l2=${code} long=${longSample} chars=${text.length}`);
          setSample({ text, title: c.title });
        }
      })
      .catch(() => {
        logwarn(`tokenizer card sample load failed l2=${code}`);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, code, longSample]);

  const blocks = useMemo<ReaderBlock[] | null>(
    () => (sample ? parseMarkdown(sample.text) : null),
    [sample],
  );

  // Reader-style translation split (persisted, draggable handle) — matches the
  // EPUB reader so the tokenizer test shows translation exactly like the reader
  // (SPEC-055 note). Only the final ratio is committed; the row re-splits live.
  const persistedSplit = display.translationSplit;
  const [liveSplit, setLiveSplit] = useState(persistedSplit);
  const appliedSplit = liveSplit;
  const onTranslationSplitChange = useCallback((r: number) => setLiveSplit(r), []);
  const onTranslationSplitCommit = useCallback((r: number) => {
    setLiveSplit(r);
    updateDisplay({ translationSplit: r });
  }, [updateDisplay]);
  useEffect(() => {
    setLiveSplit((prev) => (Math.abs(prev - persistedSplit) < 0.001 ? prev : persistedSplit));
  }, [persistedSplit]);

  const readerLeading = readerLeadingPx(
    tokenizedText.zoom,
    tokenizedText.leading ?? READER_DEFAULT_LEADING,
  );
  const measureNonce = `${textZoom}:${tokenizedText.leading ?? 1.625}:${showTranslation ? 1 : 0}:${appliedSplit}:${tokenizedText.translationSize}`;

  const l2 = { code };
  const ctx: Partial<SavedWordContext> = { textTitle: t('title.tokenizer_test') };
  const langName = languageName(code, l1.code);

  const handleLemmatize = useCallback(
    async (texts: string[]) => {
      const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, l2: code }),
      });
      const data = res.ok ? await res.json() : null;
      return data?.results ?? [];
    },
    [code],
  );

  const handlePageTranslate = useCallback(
    async (texts: string[]) => {
      try {
        const { byKey } = await translateTextsKeyed(texts, l1.code, code);
        return byKey;
      } catch {
        return {};
      }
    },
    [l1.code, code],
  );

  const renderBlock = useCallback(
    (item: ReaderPageItem, rctx: BlockRenderCtx) => {
      if (item.kind === 'markdown') {
        return (
          <div key={item.key}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.block.raw}</ReactMarkdown>
          </div>
        );
      }
      const tb = item.block as TextBlock;
      const Tag = blockTag(tb);
      return (
        // Wrap in SentenceHighlightBlock + TextActionMenu so the translation
        // renders side-by-side (md+) / stacked (narrow) exactly like the
        // reader, including the draggable split handle and the per-sentence
        // hover highlight.
        <SentenceHighlightBlock key={item.key} text={tb.text} translation={showTranslation ? rctx.translation : null}>
          {({ map, activeSentence, onTokenHover }) => (
            <TextActionMenu
              text={tb.text}
              l2Code={code}
              l1Code={l1.code}
              translationAligned={showTranslation && rctx.translation
                ? { text: rctx.translation, map, active: activeSentence, measureNonce }
                : null}
              translationClass={translationClass(tb)}
              translationFontSize={translationFontSizeRem(tb, textZoom, tokenizedText.translationSize)}
              translationSplit={appliedSplit}
              onTranslationSplitChange={onTranslationSplitChange}
              onTranslationSplitCommit={onTranslationSplitCommit}
              sideBySideBreakpoint="md"
              sideBySideGapPx={readerLeading}
              loading={showTranslation && !rctx.translation}
            >
              <Tag className={blockClass(tb)}>
                <TokenizedText
                  text={tb.text}
                  l2Code={code}
                  context={ctx}
                  tokens={rctx.tokens}
                  formats={tb.formats}
                  deferTokenization
                  selectionDictionary
                  onTokenHover={onTokenHover}
                />
              </Tag>
            </TextActionMenu>
          )}
        </SentenceHighlightBlock>
      );
    },
    [code, showTranslation, ctx, l1.code, textZoom, tokenizedText.translationSize, appliedSplit, onTranslationSplitChange, onTranslationSplitCommit, readerLeading, measureNonce],
  );

  const renderMeasureBlock = useCallback(
    (item: ReaderPageItem) => {
      if (item.kind === 'markdown') {
        return (
          <div key={item.key} className="mb-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.block.raw}</ReactMarkdown>
            {showTranslation && <div className="h-6" />}
          </div>
        );
      }
      const tb = item.block as TextBlock;
      const Tag = blockTag(tb);
      const lines = Math.max(1, Math.ceil(tb.text.length / 50));
      return (
        <div key={item.key} className="mb-4 flex items-start gap-3">
          <div
            className="flex-1 min-w-0 flex flex-col gap-y-2 md:flex-row md:gap-[var(--reader-side-gap)] md:items-center"
            style={{ '--reader-side-gap': `${readerLeading}px` } as React.CSSProperties}
          >
            <div className="flex-[3] min-w-0">
              <Tag className={blockClass(tb)} style={{ zoom: textZoom }}>
                {tb.text}
              </Tag>
            </div>
            {showTranslation && (
              <div
                className={`flex-[2] min-w-0 pt-1 md:pt-0 ${translationClass(tb)}`}
                style={{ fontSize: `${translationFontSizeRem(tb, textZoom, tokenizedText.translationSize)}rem` }}
              >
                <div className="flex flex-col gap-y-1.5">
                  {Array.from({ length: lines }).map((_, li) => (
                    <div key={li} style={{ height: `${translationFontSizeRem(tb, textZoom, tokenizedText.translationSize)}rem` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Mirrors the action-menu button column's minimum height
              (shared trigger geometry — @langplayer/utils/action-trigger). */}
          <div
            className="shrink-0"
            style={{ width: ACTION_TRIGGER_SIZE_PX, height: actionTriggerBoxPx(actionTriggerFontPx(textZoom), tokenizedText.leading) }}
          />
        </div>
      );
    },
    [showTranslation, textZoom, tokenizedText.translationSize, readerLeading],
  );

  return (
    <section
      ref={ref}
      style={{ height }}
      className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-3"
    >
      <h2 className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-base font-semibold text-foreground">
        <span>{flagEmoji(code)}</span>
        {langName}
      </h2>
      <div className="flex min-h-0 flex-1 flex-col">
        {blocks ? (
          <PaginatedReader
            blocks={blocks}
            l1={{ code: l1.code }}
            l2={l2}
            ctx={ctx}
            text={sample?.text}
            measureNonce={measureNonce}
            onLemmatize={handleLemmatize}
            onPageTranslate={handlePageTranslate}
            disableKeyboardPaging
            contentClassName="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
              [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
              [&_p]:mb-0 [&_p]:leading-relaxed"
            renderBlock={renderBlock}
            renderMeasureBlock={renderMeasureBlock}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </section>
  );
}
