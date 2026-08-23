'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadSampleContent, type SavedWordContext } from '@langplayer/shared';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useTextScale } from '@/hooks/use-text-scale';
import { languageName, flagEmoji } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { TokenizedText } from '@/components/tokenized-text';
import {
  PaginatedReader,
  type BlockRenderCtx,
  type ReaderPageItem,
} from '@/components/reader/paginated-reader';
import { blockTag, blockClass } from '@/components/reader/shared-reader-styles';
import { type ReaderBlock, type TextBlock, parseMarkdown } from '@/lib/parse-markdown';
import { log, logwarn } from '@/lib/logger';
import { Loader2 } from 'lucide-react';

/**
 * One language's tokenization test in the tokenizer test page.
 *
 * The long sample is lazy-loaded: the section mounts as a placeholder and only
 * imports the language's sample chunk + mounts a `PaginatedReader` once it
 * scrolls into view (web IntersectionObserver, rootMargin 200px). Same
 * lazy-load contract the mobile tokenizer page uses.
 */
export function TokenizerLanguageCard({ code }: { code: string }) {
  const { l1 } = useLanguage();
  const { display, tokenizedText } = useSettingsContext();
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

  // Import the sample chunk once the card is about to be shown.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    loadSampleContent(code)
      .then((c) => {
        if (!cancelled) {
          const text = c.long ?? c.short;
          log(`tokenizer card sample loaded l2=${code} chars=${text.length}`);
          setSample({ text, title: c.title });
        }
      })
      .catch(() => {
        logwarn(`tokenizer card sample load failed l2=${code}`);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, code]);

  const blocks = useMemo<ReaderBlock[] | null>(
    () => (sample ? parseMarkdown(sample.text) : null),
    [sample],
  );

  const measureNonce = `${textZoom}:${tokenizedText.leading ?? 1.625}:${showTranslation ? 1 : 0}`;

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
        <div key={item.key} className="mb-4">
          <Tag className={blockClass(tb)}>
            <TokenizedText
              text={tb.text}
              l2Code={code}
              context={ctx}
              tokens={rctx.tokens}
              formats={tb.formats}
              deferTokenization
              selectionDictionary
            />
          </Tag>
          {showTranslation && rctx.translation && (
            <p className="mt-1 text-muted-foreground">{rctx.translation}</p>
          )}
        </div>
      );
    },
    [code, showTranslation, ctx],
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
      return (
        <div key={item.key} className="mb-4">
          <Tag className={blockClass(tb)} style={{ zoom: textZoom }}>
            {tb.text}
          </Tag>
          {showTranslation && <div className="h-6" />}
        </div>
      );
    },
    [showTranslation, textZoom],
  );

  return (
    <section
      ref={ref}
      className="flex h-[65vh] min-h-0 flex-col rounded-lg border border-border bg-card"
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
