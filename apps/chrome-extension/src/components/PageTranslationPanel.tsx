import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api-config';
import { apiFetch } from '../api-fetch';
import { t, logwarn } from '../i18n';
import { Button } from './ui/button';

interface PageBlock {
  id: string;
  text: string;
  href?: string | null;
}

type TranslationStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface PageTranslationPanelProps {
  tabId: number | null;
  l1Code: string;
  l2Code: string;
  pageUrl?: string;
}

const TRANSLATION_BATCH_SIZE = 5;

/**
 * Side-panel page translation. The page content script supplies source blocks;
 * this component owns the translated-block cache and only requests blocks
 * that enter the side-panel viewport.
 */
export const PageTranslationPanel: React.FC<PageTranslationPanelProps> = ({ tabId, l1Code, l2Code, pageUrl }) => {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const blockElements = useRef(new Map<string, HTMLElement>());
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(new Set<string>());
  const flushTimerRef = useRef<number | null>(null);
  const requestGenerationRef = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setStatus('loading');
    setError(null);
    setBlocks([]);
    setTranslated(new Map());
    setPending(new Set());
    setFailed(new Set());
    queueRef.current = [];
    inFlightRef.current.clear();

    if (!tabId) {
      setStatus('error');
      setError(t('pageUnavailable'));
      return;
    }

    try {
      const response: any = await chrome.tabs.sendMessage(tabId, { action: 'getPageTranslationSnapshot' });
      if (generation !== requestGenerationRef.current) return;
      if (!response?.ok) throw new Error(response?.error || t('pageUnavailable'));
      const nextBlocks = Array.isArray(response.blocks) ? response.blocks : [];
      setBlocks(nextBlocks);
      setStatus(nextBlocks.length > 0 ? 'ready' : 'empty');
    } catch (err: any) {
      if (generation !== requestGenerationRef.current) return;
      setStatus('error');
      setError(err?.message || t('pageUnavailable'));
    }
  }, [tabId]);

  useEffect(() => {
    loadSnapshot();
    return () => {
      requestGenerationRef.current += 1;
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      queueRef.current = [];
      inFlightRef.current.clear();
    };
  }, [loadSnapshot, l1Code, l2Code, pageUrl]);

  const queueBlock = useCallback((id: string) => {
    if (translated.has(id) || inFlightRef.current.has(id) || queueRef.current.includes(id)) return;
    queueRef.current.push(id);
    setPending((current) => new Set(current).add(id));
    if (flushTimerRef.current === null) {
      const flush = () => {
        flushTimerRef.current = null;
        const ids = queueRef.current.splice(0, TRANSLATION_BATCH_SIZE);
        if (ids.length > 0) translateBlocks(ids);
        if (queueRef.current.length > 0) {
          flushTimerRef.current = window.setTimeout(flush, 0);
        }
      };
      flushTimerRef.current = window.setTimeout(flush, 60);
    }
  }, [translated]);

  const translateBlocks = useCallback(async (ids: string[]) => {
    const selected = ids
      .map((id) => blocks.find((block) => block.id === id))
      .filter((block): block is PageBlock => !!block);
    if (selected.length === 0) return;
    selected.forEach((block) => inFlightRef.current.add(block.id));

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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: any = await response.json();
      const values: string[] = Array.isArray(data.translated_texts) ? data.translated_texts : [];
      setTranslated((current) => {
        const next = new Map(current);
        selected.forEach((block, index) => {
          if (values[index]) next.set(block.id, values[index]);
        });
        return next;
      });
      setFailed((current) => {
        const next = new Set(current);
        selected.forEach((block) => next.delete(block.id));
        return next;
      });
    } catch (err) {
      logwarn('[PAGE] page translation failed:', err);
      setFailed((current) => new Set([...current, ...selected.map((block) => block.id)]));
    } finally {
      selected.forEach((block) => inFlightRef.current.delete(block.id));
      setPending((current) => {
        const next = new Set(current);
        selected.forEach((block) => next.delete(block.id));
        return next;
      });
    }
  }, [blocks, l1Code, l2Code]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || blocks.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = (entry.target as HTMLElement).dataset.blockId;
          if (id) queueBlock(id);
        }
      }),
      { root, rootMargin: '240px' },
    );
    blockElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [blocks, queueBlock]);

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
        return (
          <article
            key={block.id}
            data-block-id={block.id}
            ref={(element) => {
              if (element) blockElements.current.set(block.id, element);
              else blockElements.current.delete(block.id);
            }}
            className="lpv-page-translation-block"
          >
            <p className="lpv-page-translation-source">{block.text}</p>
            {translated.has(block.id) ? (
              <p className="lpv-page-translation-result">{translated.get(block.id)}</p>
            ) : isPending ? (
              <p className="lpv-page-translation-pending" aria-live="polite">{t('translating')}</p>
            ) : hasFailed ? (
              <button className="lpv-page-translation-retry" onClick={() => queueBlock(block.id)}>{t('retry')}</button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
};
