import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type TranslationStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface PageTranslationPanelProps {
  tabId: number | null;
  l1Code: string;
  l2Code: string;
  pageUrl?: string;
  lookup?: PageLookup | null;
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
}) => {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const blockElements = useRef(new Map<string, HTMLElement>());
  const blocksRef = useRef<PageBlock[]>([]);
  const translatedRef = useRef(new Map<string, string>());
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(new Set<string>());
  const flushTimerRef = useRef<number | null>(null);
  const requestGenerationRef = useRef(0);
  const translateBlocksRef = useRef<(ids: string[], generation: number) => void>(() => {});
  const highlightTimerRef = useRef<number | null>(null);

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
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        response = await chrome.tabs.sendMessage(tabId, { action: 'getPageTranslationSnapshot' });
        log('[PAGE] translation snapshot response', {
          generation,
          attempt,
          ok: response?.ok,
          error: response?.error,
          blocks: Array.isArray(response?.blocks) ? response.blocks.length : null,
        });
        if (response?.ok || response?.error !== 'page translation is not active') break;
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
      setError(err?.message || t('pageUnavailable'));
      logwarn('[PAGE] translation snapshot failed', {
        generation,
        message: err?.message,
        name: err?.name,
      });
    }
  }, [l1Code, l2Code, pageUrl, tabId]);

  useEffect(() => {
    loadSnapshot();
    return () => {
      requestGenerationRef.current += 1;
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      queueRef.current = [];
      inFlightRef.current.clear();
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    };
  }, [loadSnapshot]);

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
    setHighlightedBlockId(blockId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedBlockId(null), 1800);
  }, [blocks, lookup?.blockId, lookup?.token?.text]);

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
              <p className="lpv-page-translation-result">{value}</p>
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
