'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { Button } from '@/components/ui/button';
import { Globe, Loader2 } from 'lucide-react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';

// Lazy-load turndown for HTML→markdown conversion
let _turndown: any = null;
async function getTurndown() {
  if (!_turndown) {
    const Turndown = (await import('turndown')).default;
    _turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }
  return _turndown;
}

async function htmlToMarkdown(html: string, baseUrl: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu, .navigation, .mw-jump-link, .mw-editsection, .reference, .noprint, .thumb, .infobox, .navbox, .metadata').forEach(el => el.remove());
  const mainContent = doc.querySelector('#mw-content-text') || doc.querySelector('article') || doc.body;
  mainContent.querySelectorAll('a').forEach(el => {
    const href = el.getAttribute('href');
    if (href) { try { el.setAttribute('href', new URL(href, baseUrl).href); } catch {} }
  });
  const td = await getTurndown();
  return td.turndown(mainContent.innerHTML);
}

export default function WebReaderPage() {
  const searchParams = useSearchParams();
  const { l1, l2 } = useLanguage();
  const t = useT();

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);

  // Load from URL param on mount
  const urlParam = searchParams.get('url');
  useEffect(() => {
    if (urlParam) {
      const decoded = decodeURIComponent(urlParam);
      setUrl(decoded);
      handleLoad(decoded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoad = useCallback(async (loadUrl?: string) => {
    const targetUrl = loadUrl || url;
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const md = await htmlToMarkdown(raw, targetUrl);
      // Extract title from the first h1
      const titleMatch = md.match(/^#\s+(.+)$/m);
      setTitle(titleMatch?.[1]?.replace(/[#\s]/g, '') || targetUrl);
      setText(md);
      setBlocks(null);
    } catch (e: any) {
      setError(e?.message || t('msg.failed_to_load_url'));
    } finally {
      setLoading(false);
    }
  }, [url, t]);

  const handleTokenize = useCallback(() => {
    if (!text.trim()) return;
    try {
      setBlocks(parseMarkdown(text));
    } catch {
      setBlocks(null);
    }
  }, [text]);

  const ctx = { text: text.slice(0, 200), textTitle: title || 'Web Reader' };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-57px)] flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        <Globe className="h-6 w-6 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{title || t('title.web_reader')}</h1>
          <p className="text-xs text-muted-foreground">{l2.name} → {l1.name}</p>
        </div>
      </div>

      {/* ── URL input ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleLoad(); }}
        className="mb-6 flex gap-2 flex-shrink-0"
      >
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('placeholder.paste_url', { l2: l2.name })}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <Button type="submit" size="sm" disabled={!url.trim() || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('action.load')}
        </Button>
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950">
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {text && (
        <ReaderPanel
          l2={l2} l1={l1}
          text={text}
          loading={loading}
          activeTab="read"
          translating={false}
          blocks={blocks}
          ctx={ctx}
          onTextChange={() => {}}
          onTabChange={() => {}}
          onTokenize={handleTokenize}
          onFillSample={() => {}}
          onLemmatize={async (texts) => {
            const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ texts, l2: l2.code }),
            });
            const data = res.ok ? await res.json() : null;
            return data?.results ?? [];
          }}
          onPageTranslate={async (texts) => {
            try {
              const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts, l1: l1.code, l2: l2.code }),
              });
              const data = await res.json();
              return data?.translated_texts ?? [];
            } catch {
              return [];
            }
          }}
        />
      )}

      {/* ── Empty state ── */}
      {!text && !loading && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center flex-1">
          <Globe className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-muted-foreground">{t('title.web_reader')}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t('msg.web_reader_empty_state', { l2: l2.name })}
          </p>
        </div>
      )}
    </div>
  );
}
