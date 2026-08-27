import React, { useCallback, useEffect, useRef, useState } from 'react';
import { baseCode, buildSentenceMap, sentenceIndexAt } from '@langplayer/utils';
import { API_BASE } from '../api-config';
import { apiFetch } from '../api-fetch';
import { log, logwarn, t } from '../i18n';
import { Button } from './ui/button';

interface PageBlock {
  id: string;
  text: string;
  href?: string | null;
}

interface PageLookup {
  blockId?: string | null;
  token?: { text?: string };
}

/** Token hover from the page content script — drives the translation scroll +
 *  sentence highlight (apps/web reader parity). */
interface PageTranslationHover {
  blockId?: string | null;
  sentenceIndex?: number;
  /** UTF-16 offset of the hovered token within the full block source text. */
  tokenOffset?: number | null;
  blockText?: string;
  tokenText?: string;
}

type TranslationStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface PageTranslationPanelProps {
  tabId: number | null;
  l1Code: string;
  l2Code: string;
  pageUrl?: string;
  lookup?: PageLookup | null;
  hover?: PageTranslationHover | null;
}

const TRANSLATION_BATCH_SIZE = 5;
const RETRY_DELAY_MS = 80;

function skeletonWidths(text: string): number[] {
  const lineCount = Math.max(1, Math.min(8, Math.ceil(text.length / 48)));
  return Array.from({ length: lineCount }, (_, index) => {
    if (index === lineCount - 1) return 38 + ((text.length * 7) % 38);
    return 72 + ((text.length * (index + 3)) % 25);
  });
}

/**
 * Side-panel page translation. Source text stays on the webpage; this panel
 * renders only translated blocks. IntersectionObserver queues only blocks
 * currently visible in this scroll container, while every block gets a
 * length-proportional skeleton so unloaded content still has stable layout.
 */
export const PageTranslationPanel: React.FC<PageTranslationPanelProps> = ({
  tabId,
  l1Code,
  l2Code,
  pageUrl,
  lookup,
  hover,
}) => {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  /** Per-block hover state used to highlight the translation SENTENCE. Keyed by
   *  the rendered block id (a whole paragraph block). */
  const [activeHover, setActiveHover] = useState<Record<string, { tokenOffset?: number | null; sentenceIndex: number }>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const blockElements = useRef(new Map<string, HTMLElement>());
  const blocksRef = useRef<PageBlock[]>([]);
  const translatedRef = useRef(new Map<string, string>());
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(new Set<string>());
  const flushTimerRef = useRef<number | null>(null);
  const requestGenerationRef = useRef(0);
  const translateBlocksRef = useRef<(ids: string[], generation: number) => void>(() => {});

  // Translating a language into itself is meaningless (l1 === l2) — disable
  // page translation entirely in that case.
  const canTranslate = baseCode(l1Code) !== baseCode(l2Code);

  const loadSnapshot = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setStatus('loading');
    setError(null);
    setBlocks([]);
    blocksRef.current = [];
    setTranslated(new Map());
    translatedRef.current = new Map();
    setPending(new Set());
    setFailed(new Set());
    setActiveHover({});
    queueRef.current = [];
    inFlightRef.current.clear();
    log('[PAGE] translation snapshot requested', { tabId, l1Code, l2Code, pageUrl, generation });

    if (!tabId) {
      setStatus('error');
      setError(t('pageUnavailable'));
      logwarn('[PAGE] translation snapshot skipped: no active tab');
      return;
    }

    try {
      let response: any = null;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          response = await chrome.tabs.sendMessage(tabId, { action: 'getPageTranslationSnapshot' });
        } catch (sendErr: any) {
          // No content script is running on this tab (e.g. the tab predates a
          // reload of the extension, or the page isn't a supported one). The
          // message channel has no receiver, so retrying is pointless — the
          // outer catch turns this into a friendly error, not Chrome's raw
          // "Could not establish connection. Receiving end does not exist."
          logwarn('[PAGE] no content script on tab for translation snapshot', {
            tabId,
            generation,
            message: sendErr?.message,
            name: sendErr?.name,
          });
          break;
        }
        log('[PAGE] translation snapshot response', {
          generation,
          attempt,
          ok: response?.ok,
          error: response?.error,
          blocks: Array.isArray(response?.blocks) ? response.blocks.length : null,
        });
        if (response?.ok || response?.error !== 'page translation is not active') break;
        // The page content script reports the lifecycle is not active (its
        // panelOpen/enabled state was lost, e.g. the tab navigated and the
        // background hasn't re-asserted panel-open yet). Re-assert the
        // page-translation lifecycle — the same message the tab switch sends —
        // so a retry recovers instead of spinning on "not active".
        if (attempt === 1) {
          try {
            await chrome.tabs.sendMessage(tabId, { action: 'pageTranslationVisibility', open: true });
          } catch {}
        }
        await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
      }
      if (generation !== requestGenerationRef.current) return;
      if (!response?.ok) throw new Error(response?.error || t('pageUnavailable'));
      const nextBlocks = Array.isArray(response.blocks) ? response.blocks : [];
      blocksRef.current = nextBlocks;
      setBlocks(nextBlocks);
      setStatus(nextBlocks.length > 0 ? 'ready' : 'empty');
      log('[PAGE] translation snapshot loaded', { generation, blocks: nextBlocks.length });
    } catch (err: any) {
      if (generation !== requestGenerationRef.current) return;
      setStatus('error');
      // Never surface internal protocol tokens (e.g. "page translation is not
      // active") or Chrome's generic "Could not establish connection. Receiving
      // end does not exist." — map both to a friendly, translated message.
      const raw = err?.message || '';
      const friendly = raw === 'page translation is not active'
        || /Receiving end does not exist/i.test(raw)
        ? t('pageUnavailable')
        : (raw || t('pageUnavailable'));
      setError(friendly);
      logwarn('[PAGE] translation snapshot failed', {
        generation,
        message: raw,
        name: err?.name,
      });
    }
  }, [l1Code, l2Code, pageUrl, tabId]);

  useEffect(() => {
    if (!canTranslate) return;
    loadSnapshot();
    return () => {
      requestGenerationRef.current += 1;
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      queueRef.current = [];
      inFlightRef.current.clear();
    };
  }, [canTranslate, loadSnapshot]);

  const translateBlocks = useCallback(async (ids: string[], generation: number) => {
    if (generation !== requestGenerationRef.current) return;
    const selected = ids
      .map((id) => blocksRef.current.find((block) => block.id === id))
      .filter((block): block is PageBlock => !!block);
    if (selected.length === 0) return;
    selected.forEach((block) => inFlightRef.current.add(block.id));
    log('[PAGE] translation request', {
      generation,
      ids: selected.map((block) => block.id),
      lengths: selected.map((block) => block.text.length),
      l1: l1Code,
      l2: l2Code,
    });

    try {
      const response = await apiFetch(`${API_BASE}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: selected.map((block) => block.text),
          l1: l1Code,
          l2: l2Code,
        }),
      });
      const bodyText = await response.text();
      let data: any = {};
      try {
        data = bodyText ? JSON.parse(bodyText) : {};
      } catch (parseError: any) {
        logwarn('[PAGE] translation response JSON parse failed', {
          generation,
          status: response.status,
          bodyPreview: bodyText.slice(0, 240),
          message: parseError?.message,
        });
      }
      log('[PAGE] translation response', {
        generation,
        status: response.status,
        ok: response.ok,
        requested: selected.length,
        returned: Array.isArray(data.translated_texts) ? data.translated_texts.length : 0,
        bodyKeys: Object.keys(data || {}),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (generation !== requestGenerationRef.current) return;

      const values: string[] = Array.isArray(data.translated_texts) ? data.translated_texts : [];
      if (values.length !== selected.length) {
        logwarn('[PAGE] translation response count mismatch', {
          generation,
          requestedIds: selected.map((block) => block.id),
          returnedCount: values.length,
        });
      }
      setTranslated((current) => {
        const next = new Map(current);
        selected.forEach((block, index) => {
          if (values[index]) next.set(block.id, values[index]!);
        });
        translatedRef.current = next;
        return next;
      });
      setFailed((current) => {
        const next = new Set(current);
        selected.forEach((block, index) => {
          if (values[index]) next.delete(block.id);
          else next.add(block.id);
        });
        return next;
      });
    } catch (err: any) {
      if (generation !== requestGenerationRef.current) return;
      logwarn('[PAGE] page translation failed', {
        generation,
        ids: selected.map((block) => block.id),
        message: err?.message,
        name: err?.name,
      });
      setFailed((current) => new Set([...current, ...selected.map((block) => block.id)]));
    } finally {
      selected.forEach((block) => inFlightRef.current.delete(block.id));
      if (generation === requestGenerationRef.current) {
        setPending((current) => {
          const next = new Set(current);
          selected.forEach((block) => next.delete(block.id));
          return next;
        });
      }
    }
  }, [l1Code, l2Code]);

  translateBlocksRef.current = translateBlocks;

  const queueBlock = useCallback((id: string) => {
    if (translatedRef.current.has(id) || inFlightRef.current.has(id) || queueRef.current.includes(id)) return;
    queueRef.current.push(id);
    setPending((current) => new Set(current).add(id));
    log('[PAGE] translation block queued', { id, queueLength: queueRef.current.length });
    if (flushTimerRef.current === null) {
      const flush = () => {
        flushTimerRef.current = null;
        const ids = queueRef.current.splice(0, TRANSLATION_BATCH_SIZE);
        if (ids.length > 0) translateBlocksRef.current(ids, requestGenerationRef.current);
        if (queueRef.current.length > 0) flushTimerRef.current = window.setTimeout(flush, 0);
      };
      flushTimerRef.current = window.setTimeout(flush, 60);
    }
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || blocks.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = (entry.target as HTMLElement).dataset.blockId;
        if (id) queueBlock(id);
      }),
      { root, rootMargin: '0px' },
    );
    blockElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [blocks, queueBlock]);

  useEffect(() => {
    const blockId = lookup?.blockId;
    if (!blockId) return;
    const element = blockElements.current.get(blockId);
    if (!element) {
      logwarn('[PAGE] lookup target is not in translation snapshot', {
        blockId,
        token: lookup?.token?.text,
        blocks: blocks.length,
      });
      return;
    }
    log('[PAGE] scrolling translation to lookup block', { blockId, token: lookup?.token?.text });
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Keep the current-line marker on the block the learner is reading until
    // they tap a different token (matching the subtitles active-cue behavior,
    // which does not auto-clear). No timer here — a clear would make the
    // indicator flash in and out.
    setHighlightedBlockId(blockId);
  }, [blocks, lookup?.blockId, lookup?.token?.text]);

  // Token hover → scroll the translation + highlight the SENTENCE containing
  // the hovered token (apps/web reader parity). Each rendered block is a whole
  // paragraph (the snapshot does not split sentences into sub-blocks), so the
  // sentence is resolved and highlighted within the single block.
  useEffect(() => {
    if (!hover?.blockId) return;
    const sentenceIndex = hover.sentenceIndex ?? 0;
    const element = blockElements.current.get(hover.blockId);
    if (!element) {
      logwarn('[PAGE] hover target is not in translation snapshot', {
        blockId: hover.blockId,
        token: hover.tokenText,
        blocks: blocks.length,
      });
      return;
    }
    log('[PAGE] hover → scrolling translation block', { blockId: hover.blockId, token: hover.tokenText });
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Whole block — highlight the translation sentence at the hovered source offset.
    setActiveHover((cur) => ({ ...cur, [hover.blockId!]: { tokenOffset: hover.tokenOffset, sentenceIndex } }));
  }, [hover, blocks.length]);

  // Render a block's translation as sentence spans so the SENTENCE containing a
  // hovered source token can be highlighted (matches apps/web's SegmentedTranslation).
  // Falls back to a plain paragraph when there's no hover or the alignment fails.
  const renderTranslationValue = (block: PageBlock, value: string) => {
    const hoverInfo = activeHover[block.id];
    if (!hoverInfo) return <p className="lpv-page-translation-result">{value}</p>;
    const map = buildSentenceMap(block.text, value);
    if (!map) return <p className="lpv-page-translation-result">{value}</p>;
    let activePair = -1;
    if (hoverInfo.tokenOffset != null) {
      const idx = sentenceIndexAt(map, hoverInfo.tokenOffset);
      activePair = idx != null ? idx : -1;
    } else {
      activePair = Math.min(Math.max(0, hoverInfo.sentenceIndex), map.pairs.length - 1);
    }
    const pair = activePair >= 0 ? map.pairs[activePair] : undefined;
    const activeTrIndex = pair ? map.tr.findIndex((seg) => seg.start === pair.tr.start) : -1;
    return (
      <p className="lpv-page-translation-result">
        {map.tr.map((seg, i) => (
          <span
            key={i}
            className={i === activeTrIndex ? 'lpv-page-translation-sentence is-active' : 'lpv-page-translation-sentence'}
          >
            {value.slice(seg.start, seg.end)}
          </span>
        ))}
      </p>
    );
  };

  if (!canTranslate) {
    // l1 === l2: translating a page into its own language is meaningless.
    return <div className="lpv-ui-empty-state" role="status"><p>{t('pageUnavailable')}</p></div>;
  }
  if (status === 'loading' || status === 'idle') {
    return <div className="lpv-ui-empty-state" role="status" aria-live="polite"><span className="lpv-ui-spinner" aria-hidden="true" /><p>{t('loadingSubtitles')}</p></div>;
  }
  if (status === 'error') {
    return <div className="lpv-ui-empty-state" role="alert"><p>{error || t('pageUnavailable')}</p><Button variant="outline" size="sm" onClick={loadSnapshot}>{t('retry')}</Button></div>;
  }
  if (status === 'empty') {
    return <div className="lpv-ui-empty-state" role="status"><p>{t('noReadableContent')}</p><Button variant="outline" size="sm" onClick={loadSnapshot}>{t('retry')}</Button></div>;
  }

  return (
    <div ref={scrollRef} className="lpv-page-translation-scroll" role="region" aria-label={t('pageTranslation')}>
      {blocks.map((block) => {
        const isPending = pending.has(block.id);
        const hasFailed = failed.has(block.id);
        const value = translated.get(block.id);
        return (
          <article
            key={block.id}
            data-block-id={block.id}
            ref={(element) => {
              if (element) blockElements.current.set(block.id, element);
              else blockElements.current.delete(block.id);
            }}
            className={`lpv-page-translation-block ${highlightedBlockId === block.id ? 'is-highlighted' : ''}`}
          >
            {value ? (
              renderTranslationValue(block, value)
            ) : hasFailed ? (
              <div className="lpv-page-translation-failed">
                <p>{t('failedToLoadSubtitles')}</p>
                <button className="lpv-page-translation-retry" onClick={() => queueBlock(block.id)}>{t('retry')}</button>
              </div>
            ) : (
              <div className="lpv-page-translation-skeleton" aria-busy={isPending || undefined} aria-label={isPending ? t('translating') : undefined}>
                {skeletonWidths(block.text).map((width, index) => (
                  <span key={index} style={{ width: `${width}%` }} />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
