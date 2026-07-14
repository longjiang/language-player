'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/providers/language-provider';
import { TokenizedText } from '@/components/tokenized-text';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import {
  BookOpen,
  Loader2,
  Globe,
  FileText,
  Columns2,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// localStorage key for passing text from AI explanation
const READER_TEXT_KEY = 'lp_reader_text';
const READER_TITLE_KEY = 'lp_reader_title';

/** Strip markdown formatting to get plain text for tokenization. */
function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '')
    .replace(/\d+\.\s/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  // ── Load text from query params or localStorage ──
  useEffect(() => {
    // 1. Check localStorage (from AI explanation "Open in Reader")
    const storedText = localStorage.getItem(READER_TEXT_KEY);
    const storedTitle = localStorage.getItem(READER_TITLE_KEY);
    if (storedText) {
      setText(storedText);
      setTitle(storedTitle || '');
      localStorage.removeItem(READER_TEXT_KEY);
      localStorage.removeItem(READER_TITLE_KEY);
      setActiveTab('read');
      return;
    }

    // 2. Check URL query params
    if (method && arg) {
      if (['md', 'html', 'txt'].includes(method)) {
        setText(decodeURIComponent(arg));
        setActiveTab('read');
      } else if (method === 'md-url') {
        loadUrl(arg, true);
      } else if (method === 'html-url') {
        loadUrl(arg, false);
      }
    }
  }, []);

  // ── Load URL ──
  const loadUrl = async (url: string, isMarkdown: boolean) => {
    setLoading(true);
    setError(null);
    try {
      // Use a CORS proxy (Python backend) to fetch
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();

      if (isMarkdown) {
        setText(raw);
      } else {
        // Simple HTML-to-text conversion
        const div = document.createElement('div');
        div.innerHTML = raw;
        // Remove scripts, styles, nav, header, footer
        div.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu').forEach(el => el.remove());
        setText(div.textContent?.replace(/\n{3,}/g, '\n\n').trim() || raw);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load URL');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) loadUrl(urlInput.trim(), false);
  };

  // ── Context for word saving ──
  const readerContext: Partial<SavedWordContext> = {
    text: stripMarkdown(text).slice(0, 200),
    textTitle: title || 'Reader',
  };

  // ── Loading ──
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
          <div>
            <h1 className="text-xl font-bold">
              {title || 'Reader'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {l2.name} → {l1.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit / Read tabs */}
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button
              onClick={() => setActiveTab('edit')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'edit' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="mr-1 inline h-3 w-3" />
              Edit
            </button>
            <button
              onClick={() => setActiveTab('read')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'read' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="mr-1 inline h-3 w-3" />
              Read
            </button>
          </div>

          {/* Translation toggle */}
          {activeTab === 'read' && (
            <Button
              variant={showTranslation ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowTranslation(!showTranslation)}
            >
              <Columns2 className="mr-1 h-3.5 w-3.5" />
              Translation
            </Button>
          )}
        </div>
      </div>

      {/* URL input */}
      <form onSubmit={handleUrlSubmit} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a URL to read a web page..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <Button type="submit" size="sm" disabled={!urlInput.trim() || loading}>
          Load
        </Button>
      </form>

      {/* Edit mode */}
      {activeTab === 'edit' && (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Paste ${l2.name} text here... (Markdown supported)`}
            className="min-h-[40vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
            lang={l2.code}
          />
          {showTranslation && (
            <textarea
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder={`Paste ${l1.name} translation here...`}
              className="min-h-[20vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      )}

      {/* Read mode */}
      {activeTab === 'read' && text && (
        <div className={`${showTranslation ? 'grid grid-cols-2 gap-6' : ''}`}>
          {/* L2 text with clickable words */}
          <div
            className="rounded-lg border border-border bg-card p-6"
            lang={l2.code}
            dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
          >
            {/* Render markdown first, then tokenize for clicks */}
            <div className="prose prose-base max-w-none dark:prose-invert">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>

            {/* Interactive tokenized layer — click any word */}
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                👆 Tap any word below to look it up
              </p>
              <TokenizedText
                text={stripMarkdown(text)}
                l2Code={l2.code}
                textScale={1.2}
                context={readerContext}
              />
            </div>
          </div>

          {/* L1 translation */}
          {showTranslation && (
            <div className="rounded-lg border border-border bg-muted/30 p-6">
              {translation ? (
                <div className="prose prose-base max-w-none dark:prose-invert text-muted-foreground">
                  <p className="whitespace-pre-wrap">{translation}</p>
                </div>
              ) : (
                <div className="flex min-h-[20vh] flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <ArrowLeftRight className="mb-2 h-8 w-8 opacity-30" />
                  <p>No translation yet.</p>
                  <p className="mt-1 text-xs">
                    Switch to <strong>Edit</strong> tab to paste a translation, or translate yourself.
                  </p>
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
            Paste {l2.name} text, load a URL, or open from an AI explanation to get started.
            Tap any word to see its dictionary entry.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setActiveTab('edit')}
          >
            <FileText className="mr-1 h-4 w-4" />
            Start Writing
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950">
          {error}
        </div>
      )}
    </div>
  );
}
