'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/providers/language-provider';
import { TokenizedText } from '@/components/tokenized-text';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import {
  BookOpen, Loader2, Globe, FileText, Columns2, ArrowLeftRight, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Lazy-load turndown for HTML→markdown conversion
let _turndown: any = null;
async function getTurndown() {
  if (!_turndown) {
    const Turndown = (await import('turndown')).default;
    _turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }
  return _turndown;
}

/** Convert an HTML string to markdown using turndown. */
async function htmlToMarkdown(html: string, baseUrl: string): Promise<string> {
  // Parse and clean the HTML
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove non-content elements
  doc.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu, .navigation, .mw-jump-link, .mw-editsection, .reference, .noprint, .thumb, .infobox, .navbox, .metadata').forEach(el => el.remove());

  // Try to find main content (Wikipedia-specific)
  const mainContent = doc.querySelector('#mw-content-text') || doc.querySelector('article') || doc.body;

  // Make links absolute
  mainContent.querySelectorAll('a').forEach(el => {
    const href = el.getAttribute('href');
    if (href) {
      try { el.setAttribute('href', new URL(href, baseUrl).href); } catch {}
    }
  });

  const cleanedHtml = mainContent.innerHTML;
  const td = await getTurndown();
  return td.turndown(cleanedHtml);
}

const READER_TEXT_KEY = 'lp_reader_text';
const READER_TITLE_KEY = 'lp_reader_title';

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1')
    .replace(/```[\s\S]*?```/g, '').replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '').replace(/\d+\.\s/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function blockTag(tb: TextBlock): keyof JSX.IntrinsicElements {
  switch (tb.type) {
    case 'heading': return `h${tb.depth ?? 1}` as keyof JSX.IntrinsicElements;
    case 'list-item': return 'li';
    case 'blockquote': return 'blockquote';
    default: return 'p';
  }
}

function blockClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': {
      const s: Record<number, string> = { 1: 'text-2xl font-bold', 2: 'text-xl font-semibold', 3: 'text-lg font-semibold' };
      return `${b} ${s[tb.depth ?? 1] ?? 'text-base font-medium'} mb-3 mt-4`;
    }
    case 'paragraph': return `${b} mb-3`;
    case 'list-item': return `${b} mb-1 ml-4 list-disc`;
    case 'blockquote': return `${b} border-l-4 border-muted pl-4 italic text-muted-foreground mb-3`;
    default: return `${b} mb-3`;
  }
}

export default function ReaderPage() {
  const searchParams = useSearchParams();
  const { l1, l2 } = useLanguage();
  const method = searchParams.get('method');
  const arg = searchParams.get('arg');

  const [text, setText] = useState('');
  const [translation, setTranslation] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('read');
  const [showTranslation, setShowTranslation] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  // Block-based interactive rendering
  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  const [blockTokens, setBlockTokens] = useState<LemmatizedToken[][] | null>(null);
  const [tokenizing, setTokenizing] = useState(false);

  // Parse markdown into blocks
  useEffect(() => {
    if (!text.trim()) { setBlocks(null); setBlockTokens(null); return; }
    try {
      const parsed = parseMarkdown(text);
      setBlocks(parsed);
      setBlockTokens(null);
    } catch { setBlocks(null); setBlockTokens(null); }
  }, [text]);

  // Batch-lemmatize all text blocks
  useEffect(() => {
    if (!blocks || !l2.code) return;
    const textBlocks = blocks.filter((b): b is TextBlock => b.kind === 'text');
    const texts = textBlocks.map(b => b.text);
    if (texts.length === 0) { setBlockTokens([]); return; }

    setTokenizing(true);
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/lemmatize/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l2: l2.code }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) { setBlockTokens(data?.results ?? null); setTokenizing(false); } })
      .catch(() => { if (!cancelled) setTokenizing(false); });
    return () => { cancelled = true; };
  }, [blocks, l2.code]);

  // Load text from localStorage or query params
  useEffect(() => {
    const storedText = localStorage.getItem(READER_TEXT_KEY);
    const storedTitle = localStorage.getItem(READER_TITLE_KEY);
    if (storedText) {
      setText(storedText); setTitle(storedTitle || '');
      localStorage.removeItem(READER_TEXT_KEY); localStorage.removeItem(READER_TITLE_KEY);
      setActiveTab('read'); return;
    }
    if (method && arg) {
      if (['md', 'html', 'txt'].includes(method)) { setText(decodeURIComponent(arg)); setActiveTab('read'); }
      else if (method === 'md-url') loadUrl(arg, true);
      else if (method === 'html-url') loadUrl(arg, false);
    }
  }, []);

  const loadUrl = async (url: string, isMarkdown: boolean) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      if (isMarkdown) {
        setText(raw);
      } else {
        const md = await htmlToMarkdown(raw, url);
        setText(md);
      }
    } catch (err: any) { setError(err?.message || 'Failed to load URL'); }
    finally { setLoading(false); }
  };

  const ctx: Partial<SavedWordContext> = { text: stripMarkdown(text).slice(0, 200), textTitle: title || 'Reader' };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading text...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div><h1 className="text-xl font-bold">{title || 'Reader'}</h1>
            <p className="text-xs text-muted-foreground">{l2.name} → {l1.name}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button onClick={() => setActiveTab('edit')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'edit' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <FileText className="mr-1 inline h-3 w-3" />Edit</button>
            <button onClick={() => setActiveTab('read')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'read' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <BookOpen className="mr-1 inline h-3 w-3" />Read</button>
          </div>
          {activeTab === 'read' && (
            <Button variant={showTranslation ? 'default' : 'outline'} size="sm" onClick={() => setShowTranslation(!showTranslation)}>
              <Columns2 className="mr-1 h-3.5 w-3.5" />Translation</Button>
          )}
        </div>
      </div>

      {/* URL input */}
      <form onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) loadUrl(urlInput.trim(), false); }} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a URL to read a web page..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
        <Button type="submit" size="sm" disabled={!urlInput.trim() || loading}>Load</Button>
      </form>

      {/* Edit mode */}
      {activeTab === 'edit' && (
        <div className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder={`Paste ${l2.name} text here... (Markdown supported)`}
            className="min-h-[40vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={l2.code} />
          {showTranslation && (
            <textarea value={translation} onChange={(e) => setTranslation(e.target.value)}
              placeholder={`Paste ${l1.name} translation here...`}
              className="min-h-[20vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
          )}
        </div>
      )}

      {/* Read mode */}
      {activeTab === 'read' && text && (
        <div className={`${showTranslation ? 'grid grid-cols-2 gap-6' : ''}`}>
          <div className="rounded-lg border border-border bg-card p-6" lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}>
            {/* Phase 1: ReactMarkdown while tokenizing */}
            {(!blocks || tokenizing) && (
              <>
                {tokenizing && (
                  <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Making words interactive...
                  </div>
                )}
                <div className="prose prose-base max-w-none dark:prose-invert">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              </>
            )}

            {/* Phase 2: Block-based interactive tokens */}
            {blocks && blockTokens && !tokenizing && (
              <>
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Tap any word to look it up
                </div>
                {blocks.map((block, i) => {
                  if (block.kind === 'markdown') {
                    return (
                      <div key={i} className="prose prose-base max-w-none dark:prose-invert [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1">
                        <ReactMarkdown>{block.raw}</ReactMarkdown>
                      </div>
                    );
                  }
                  const tb = block as TextBlock;
                  const Tag = blockTag(tb);
                  const textBlockIndex = blocks.slice(0, i).filter((b): b is TextBlock => b.kind === 'text').length;
                  return (
                    <Tag key={i} className={blockClass(tb)}>
                      <TokenizedText text={tb.text} l2Code={l2.code} textScale={1.15} context={ctx}
                        tokens={blockTokens[textBlockIndex]} />
                    </Tag>
                  );
                })}
              </>
            )}

            {/* Fallback: block parser unavailable — plain TokenizedText */}
            {!blocks && (
              <TokenizedText text={stripMarkdown(text)} l2Code={l2.code} textScale={1.15} context={ctx} />
            )}
          </div>

          {/* Translation */}
          {showTranslation && (
            <div className="rounded-lg border border-border bg-muted/30 p-6">
              {translation ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{translation}</div>
              ) : (
                <div className="flex min-h-[20vh] flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <ArrowLeftRight className="mb-2 h-8 w-8 opacity-30" />
                  <p>No translation yet.</p>
                  <p className="mt-1 text-xs">Switch to <strong>Edit</strong> tab to paste a translation.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {activeTab === 'read' && !text && !loading && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
          <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-muted-foreground">Reader</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Paste {l2.name} text, load a URL, or open from an AI explanation. Tap any word to see its dictionary entry.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setActiveTab('edit')}>
            <FileText className="mr-1 h-4 w-4" />Start Writing</Button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950">{error}</div>
      )}
    </div>
  );
}
