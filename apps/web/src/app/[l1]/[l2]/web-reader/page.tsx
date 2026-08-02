'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/ui/sidebar';
import { Globe, Loader2, MoreHorizontal, PanelRightClose, PanelRight, Pencil, Trash2 } from 'lucide-react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { log, logwarn } from '@/lib/logger';

interface VisitedSite {
  url: string;
  title: string;
  visitedAt: number;
}

const HISTORY_KEY = 'lp:web-reader:visited-sites:v1';
const MAX_HISTORY = 50;

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function faviconUrl(url: string): string {
  const host = hostnameOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : '';
}

function loadVisitedSites(): VisitedSite[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s: any): s is VisitedSite => !!s && typeof s.url === 'string')
      .map((s: any) => ({
        url: s.url,
        title: typeof s.title === 'string' ? s.title : s.url,
        visitedAt: typeof s.visitedAt === 'number' ? s.visitedAt : 0,
      }));
  } catch {
    return [];
  }
}

function saveVisitedSites(sites: VisitedSite[]) {
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(sites)); } catch {}
}

// Lazy-load turndown for HTML→markdown conversion
let _turndown: any = null;
async function getTurndown() {
  if (!_turndown) {
    const Turndown = (await import('turndown')).default;
    _turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    // Flatten whitespace inside link text. Source pages often put block elements
    // inside <a> (e.g. title + source name), which turndown converts to blank
    // lines inside `[...]` — invalid CommonMark, so remark would treat the whole
    // link as literal text (broken-apart `[` … `](url)` tokens). Icon-only links
    // (empty after flattening) are dropped instead of leaking stray brackets.
    _turndown.addRule('readerLink', {
      filter: (node: any) => node.nodeName === 'A' && !!node.getAttribute('href'),
      replacement: (content: string, node: any) => {
        // Block-level markers (e.g. `## ` from an <h2> nested inside the link)
        // render as literal text inside a link label — strip them so readers
        // never see raw markdown syntax.
        const flat = content
          .replace(/\s+/g, ' ')
          .replace(/(^|\s)#{1,6}(?=\s|$)/g, '$1')
          .trim();
        if (!flat) return '';
        const href = node.getAttribute('href');
        const escaped = href.replace(/([<>()])/g, '\\$1');
        const destination = escaped.indexOf(' ') >= 0 ? `<${escaped}>` : escaped;
        const title = node.getAttribute('title');
        const titlePart = title ? ` "${String(title).replace(/"/g, '\\"')}"` : '';
        return `[${flat}](${destination}${titlePart})`;
      },
    });
  }
  return _turndown;
}

async function htmlToMarkdown(html: string, baseUrl: string): Promise<{ markdown: string; title: string }> {
  log('WebReader: htmlToMarkdown start', { htmlChars: html.length, baseUrl });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Sniff the page's real title: <title> tag, then og:title, then first h1.
  const sniffedTitle =
    doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim()
    || doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.replace(/\s+/g, ' ').trim()
    || '';
  // Article pages: strip site chrome (nav, header, footer, aside, …) so only the
  // article body is converted. Pages without an article (homepages, indexes,
  // link pages) keep the whole page — there the header/nav often IS the content.
  const articleContent = doc.querySelector('#mw-content-text') || doc.querySelector('article');
  if (articleContent) {
    doc.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu, .navigation, .mw-jump-link, .mw-editsection, .reference, .noprint, .thumb, .infobox, .navbox, .metadata').forEach(el => el.remove());
  } else {
    // Whole-page fallback: only drop script/style (they'd leak raw text into
    // markdown), keep everything else.
    doc.querySelectorAll('script, style').forEach(el => el.remove());
  }
  const mainContent = articleContent || doc.body;
  log('WebReader: content source', {
    source: articleContent
      ? (articleContent.id ? `#${articleContent.id}` : articleContent.tagName.toLowerCase())
      : 'whole-page (no article)',
    bodyChildren: doc.body?.children.length ?? 0,
  });
  // Some sites (e.g. Yahoo News) render the article body as raw text nodes inside
  // a single block element, with blank lines between paragraphs. Turndown
  // collapses text-node whitespace, which would merge the whole article into one
  // paragraph — split blank-line-separated runs into real <p> elements first.
  mainContent.querySelectorAll('p, div, section, article, blockquote, li').forEach(el => {
    if (el.closest('a')) return; // keep link contents (e.g. image captions) intact
    splitTextParagraphs(el, doc);
  });
  mainContent.querySelectorAll('a').forEach(el => {
    const href = el.getAttribute('href');
    if (href) { try { el.setAttribute('href', new URL(href, baseUrl).href); } catch {} }
  });
  const td = await getTurndown();
  const markdown = td.turndown(mainContent.innerHTML);
  log('WebReader: markdown output', { chars: markdown.length, head: markdown.slice(0, 120) });
  return { markdown, title: sniffedTitle };
}

/** Split blank-line-separated text runs inside a block element into <p>s.
 *  When the container is itself a <p>, it is replaced by sibling paragraphs
 *  (nesting <p> inside <p> is invalid HTML). */
function splitTextParagraphs(container: Element, doc: Document): void {
  const children = Array.from(container.childNodes);
  if (!children.some(c => c.nodeType === Node.TEXT_NODE && /\n\s*\n/.test(c.nodeValue ?? ''))) return;

  const runs: Node[][] = [];
  let current: Node[] = [];
  const closeRun = () => { if (current.length > 0) { runs.push(current); current = []; } };

  for (const child of children) {
    if (child.nodeType !== Node.TEXT_NODE) { current.push(child); continue; }
    const parts = (child.nodeValue ?? '').split(/\n\s*\n/);
    if (parts.length === 1) { current.push(child); continue; }
    parts.forEach((part, i) => {
      if (i === 0) {
        if (part.trim()) current.push(doc.createTextNode(part));
        closeRun();
      } else if (i === parts.length - 1) {
        if (part.trim()) current.push(doc.createTextNode(part));
      } else if (part.trim()) {
        current.push(doc.createTextNode(part));
        closeRun();
      } else {
        closeRun();
      }
    });
  }
  closeRun();

  const contentRuns = runs.filter(run => run.some(n => n.nodeType !== Node.TEXT_NODE || (n.nodeValue ?? '').trim() !== ''));
  // Guard BEFORE moving nodes into <p>s — the map() below detaches children
  // from the container, so an early return here would drop them entirely.
  if (contentRuns.length < 2) return;

  const paragraphs = contentRuns.map(run => {
    const p = doc.createElement('p');
    run.forEach(n => p.appendChild(n));
    return p;
  });

  if (container.tagName === 'P') {
    container.replaceWith(...paragraphs);
  } else {
    container.replaceChildren(...paragraphs);
  }
}

export default function WebReaderPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { l1, l2 } = useLanguage();
  const t = useT();

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [visitedSites, setVisitedSites] = useState<VisitedSite[]>([]);
  const [menuUrl, setMenuUrl] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // Last URL that was loaded (or synced from the query string). Compared against
  // `?url=` instead of the live input value, so editing the address bar never
  // trips the param-sync effect and snaps the input back.
  const loadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setVisitedSites(loadVisitedSites());
  }, []);

  const handleLoad = useCallback(async (loadUrl?: string) => {
    const targetUrl = loadUrl || url;
    if (!targetUrl.trim()) return;
    loadedUrlRef.current = targetUrl;
    log('WebReader: load start', { targetUrl });
    // Keep the browser URL in sync so the loaded page can be shared or
    // reopened from an external link.
    router.replace(`${pathname}?url=${encodeURIComponent(targetUrl)}`, { scroll: false });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(targetUrl)}`);
      log('WebReader: proxy response', { status: res.status, ok: res.ok });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      log('WebReader: raw html', { chars: raw.length });
      const { markdown: md, title: sniffedTitle } = await htmlToMarkdown(raw, targetUrl);
      log('WebReader: converted markdown', { chars: md.length });
      // Fall back to the first h1, then the raw URL.
      const titleMatch = md.match(/^#\s+(.+)$/m);
      const pageTitle = sniffedTitle || titleMatch?.[1]?.trim() || targetUrl;
      setTitle(pageTitle);
      document.title = pageTitle;
      setText(md);
      setBlocks(null);
      // Divide the markdown into blocks right away (same behavior as the notes
      // reader) so each block renders as its own TextActionMenu + TokenizedText
      // instead of falling into the single-menu fallback path. Image paragraphs
      // become raw-markdown blocks and keep their image tags.
      try {
        const parsed = parseMarkdown(md);
        setBlocks(parsed);
        log('WebReader: blocks parsed', { count: parsed.length });
      } catch {
        setBlocks(null);
        logwarn('WebReader: parseMarkdown failed');
      }
      // Remember the visit (most recent first, capped) in localStorage.
      setVisitedSites(prev => {
        const next = [
          { url: targetUrl, title: pageTitle, visitedAt: Date.now() },
          ...prev.filter(s => s.url !== targetUrl),
        ].slice(0, MAX_HISTORY);
        saveVisitedSites(next);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || t('msg.failed_to_load_url'));
    } finally {
      setLoading(false);
    }
  }, [url, t]);

  const handleTokenize = useCallback(() => {
    if (!text.trim()) return;
    try {
      const parsed = parseMarkdown(text);
      setBlocks(parsed);
    } catch {
      setBlocks(null);
    }
  }, [text]);

  // Load from URL param — on mount and whenever it changes (e.g. a chevron
  // link inside a block navigates to another article while already here).
  const urlParam = searchParams.get('url');
  useEffect(() => {
    // Only react to a param that differs from the URL we already loaded. The
    // manual submit path updates the ref itself, so it can't double-load here.
    if (!urlParam || urlParam === loadedUrlRef.current) return;
    loadedUrlRef.current = urlParam;
    // searchParams.get already URL-decodes the value once — don't decode again.
    setUrl(urlParam);
    handleLoad(urlParam);
  }, [urlParam, handleLoad]);

  const handleRename = useCallback((siteUrl: string) => {
    setEditingUrl(siteUrl);
    const site = visitedSites.find(s => s.url === siteUrl);
    setEditValue(site?.title || siteUrl);
    setMenuUrl(null);
  }, [visitedSites]);

  const commitRename = useCallback((siteUrl: string) => {
    setVisitedSites(prev => {
      const next = prev.map(s => s.url === siteUrl
        ? { ...s, title: editValue.trim() || s.url }
        : s);
      saveVisitedSites(next);
      return next;
    });
    setEditingUrl(null);
  }, [editValue]);

  const handleDelete = useCallback((siteUrl: string) => {
    setVisitedSites(prev => {
      const next = prev.filter(s => s.url !== siteUrl);
      saveVisitedSites(next);
      return next;
    });
    setMenuUrl(null);
    setEditingUrl(cur => cur === siteUrl ? null : cur);
  }, []);

  const formatVisitedDate = useCallback((ts: number): string => {
    try {
      return new Date(ts).toLocaleDateString(l1.code, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return new Date(ts).toLocaleDateString();
    }
  }, [l1.code]);

  const ctx = { textTitle: title || 'Web Reader' };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-57px)] flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        <Globe className="h-6 w-6 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{title || t('title.web_reader')}</h1>
        </div>
        {/* Sidebar toggle — mobile: opens the slide-in sheet */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="lg:hidden flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t('action.show_sidebar')}
        >
          <PanelRight className="h-5 w-5" />
        </button>

        {/* Sidebar toggle — desktop: collapses the persistent panel */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="hidden lg:flex flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
        >
          {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
        </button>
      </div>

      {/* ── URL input ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleLoad(); }}
        className="mb-6 flex gap-2 flex-shrink-0"
      >
        <div className="relative flex-1">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('placeholder.paste_url', { l2: l2.name })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
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

      {/* ── Content row ── */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="min-w-0 flex-1 flex flex-col min-h-0">
          {text && (
            <ReaderPanel
          l2={l2} l1={l1}
          text={text}
          loading={loading}
          activeTab="read"
          translating={false}
          blocks={blocks}
          ctx={ctx}
          hideModeTabs
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
              const { byKey } = await translateTextsKeyed(texts, l1.code, l2.code);
              return byKey;
            } catch {
              return {};
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

        {/* Sidebar — visited sites, shared desktop panel + mobile sheet */}
        <Sidebar
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
          sidebarOpen={sidebarOpen}
          title={t('title.visited_sites')}
          desktopClassName="w-64 ml-3"
          emptyState={
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {t('msg.no_visited_sites')}
            </p>
          }
        >
          <ul className="flex flex-col gap-0.5">
            {visitedSites.map(site => {
              const isEditing = editingUrl === site.url;
              const isMenuOpen = menuUrl === site.url;
              return (
                <li key={site.url} className="relative">
                  {isMenuOpen && (
                    <div className="fixed inset-0 z-10" onClick={() => setMenuUrl(null)} />
                  )}
                  <div className="relative z-20 flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors">
                    <div className="relative mt-0.5 h-4 w-4 flex-shrink-0">
                      <Globe className="h-4 w-4 text-muted-foreground/60" />
                      {faviconUrl(site.url) && (
                        <img
                          src={faviconUrl(site.url)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-4 w-4 rounded-sm"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(site.url);
                            if (e.key === 'Escape') setEditingUrl(null);
                          }}
                          onBlur={() => commitRename(site.url)}
                          placeholder={t('placeholder.enter_title')}
                          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-sm outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => { setMenuUrl(null); setMobileSidebarOpen(false); handleLoad(site.url); }}
                          title={site.url}
                          className="block w-full truncate text-left text-sm text-foreground"
                        >
                          {site.title}
                        </button>
                      )}
                      {!isEditing && site.visitedAt > 0 && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatVisitedDate(site.visitedAt)}
                        </span>
                      )}
                    </div>
                    {!isEditing && (
                      <button
                        onClick={() => setMenuUrl(isMenuOpen ? null : site.url)}
                        aria-label={t('action.more')}
                        className="flex-shrink-0 rounded p-1 text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                    {isMenuOpen && !isEditing && (
                      <div className="absolute right-2 top-8 z-30 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                        <button
                          onClick={() => handleRename(site.url)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('action.rename')}
                        </button>
                        <button
                          onClick={() => handleDelete(site.url)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('action.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Sidebar>
      </div>
    </div>
  );
}
