'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { READING_CATEGORIES, getReadingSuggestions } from '@langplayer/shared';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/ui/sidebar';
import { Globe, Loader2, MoreHorizontal, PanelRightClose, PanelRight, Pencil, Trash2, ChevronLeft } from 'lucide-react';
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

/** True when the URL points at a site's root (pathname empty or "/"). */
function isSiteRoot(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === '' || u.pathname === '/';
  } catch {
    return false;
  }
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
  // Nav menus are site chrome, never reading content — strip them on every
  // page, including the whole-page fallback path.
  doc.querySelectorAll('nav').forEach(el => el.remove());
  // Ruby annotations (e.g. furigana on Japanese pages) are reading aids, not
  // content — Turndown would leak the <rt> readings into the markdown as plain
  // text and pollute tokenization. Drop the readings and unwrap <ruby> so only
  // the base characters remain.
  doc.querySelectorAll('rt, rp').forEach(el => el.remove());
  doc.querySelectorAll('ruby').forEach(el => {
    el.replaceWith(...Array.from(el.childNodes));
  });
  const mainContent = articleContent || doc.body;
  // Lazy-loaded images: many sites ship a 1×1 placeholder in src and the real
  // URL in data-src — promote it so the actual image renders. Images left with
  // no usable source would convert to ![alt]() and render as <img src="">.
  mainContent.querySelectorAll('img').forEach(el => {
    const real = el.getAttribute('data-src')
      || el.getAttribute('data-original')
      || el.getAttribute('data-lazy-src');
    if (real) el.setAttribute('src', real);
    const src = el.getAttribute('src') ?? '';
    if (!src || /^data:image\/gif;base64,R0lGODlhAQAB/i.test(src)) {
      el.remove();
    }
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
  const suggestions = getReadingSuggestions(l2.code);

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
  // Stable refs so the param-sync effect only re-fires when the ?url= param
  // actually changes. handleLoad's identity changes whenever the URL input
  // changes (useCallback dep), and re-running this effect on that churn would
  // race searchParams: it can still see the OLD param, differ from the URL we
  // just loaded, and reload the previous page (e.g. after "back to site home").
  const tRef = useRef(t);
  tRef.current = t;
  const showHomeButton = !!url.trim() && !isSiteRoot(url);

  // Debug: report when the back-to-home button appears or disappears.
  useEffect(() => {
    log('WebReader: back-to-home visibility', { show: showHomeButton, url });
  }, [showHomeButton]);
  // Incremented on every load/reset so stale fetch responses can't repopulate
  // the reader after the user navigated back to the home page.
  const loadSeqRef = useRef(0);

  useEffect(() => {
    setVisitedSites(loadVisitedSites());
  }, []);

  const handleLoad = useCallback(async (loadUrl?: string) => {
    const targetUrl = loadUrl || url;
    if (!targetUrl.trim()) return;
    loadedUrlRef.current = targetUrl;
    // Reflect the loaded URL in the input (e.g. when a suggestion card or
    // visited-site link was clicked with an empty address bar).
    setUrl(targetUrl);
    const seq = ++loadSeqRef.current;
    // Keep the browser URL in sync so the loaded page can be shared or
    // reopened from an external link.
    router.replace(`${pathname}?url=${encodeURIComponent(targetUrl)}`, { scroll: false });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(targetUrl)}`);
      if (seq !== loadSeqRef.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const { markdown: md, title: sniffedTitle } = await htmlToMarkdown(raw, targetUrl);
      if (seq !== loadSeqRef.current) return;
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
      } catch {
        setBlocks(null);
      }
      if (seq !== loadSeqRef.current) return;
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
      if (seq !== loadSeqRef.current) return;
      setError(e?.message || t('msg.failed_to_load_url'));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [url, t]);

  const handleLoadRef = useRef(handleLoad);
  handleLoadRef.current = handleLoad;

  const handleTokenize = useCallback(() => {
    if (!text.trim()) return;
    try {
      const parsed = parseMarkdown(text);
      setBlocks(parsed);
    } catch {
      setBlocks(null);
    }
  }, [text]);

  const handleLemmatize = useCallback(async (texts: string[]) => {
    const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l2: l2.code }),
    });
    const data = res.ok ? await res.json() : null;
    return data?.results ?? [];
  }, [l2.code]);

  const handlePageTranslate = useCallback(async (texts: string[]) => {
    try {
      const { byKey } = await translateTextsKeyed(texts, l1.code, l2.code);
      return byKey;
    } catch {
      return {};
    }
  }, [l1.code, l2.code]);

  // Load from URL param — on mount and whenever it changes (e.g. a chevron
  // link inside a block navigates to another article while already here).
  const urlParam = searchParams.get('url');
  useEffect(() => {
    // Navigating to the web reader home (no ?url= param) must show the home
    // page, not the last opened article — clear any loaded content and
    // invalidate in-flight loads so a stale response can't repopulate it.
    if (!urlParam) {
      if (loadedUrlRef.current) {
        loadedUrlRef.current = null;
        loadSeqRef.current++;
        setText('');
        setTitle('');
        setBlocks(null);
        setError(null);
        setUrl('');
        setLoading(false);
        document.title = tRef.current('title.web_reader');
      }
      return;
    }
    // Only react to a param that differs from the URL we already loaded. The
    // manual submit path updates the ref itself, so it can't double-load here.
    if (urlParam === loadedUrlRef.current) return;
    loadedUrlRef.current = urlParam;
    // searchParams.get already URL-decodes the value once — don't decode again.
    setUrl(urlParam);
    handleLoadRef.current(urlParam);
  }, [urlParam]);

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
        {/* Clicking the globe returns to the reader home (clears any ?url= param). */}
        <Link
          href={pathname}
          aria-label={t('title.web_reader')}
          title={t('title.web_reader')}
          className="flex-shrink-0 text-primary transition-opacity hover:opacity-80"
        >
          <Globe className="h-6 w-6" />
        </Link>
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
        {/* Site favicon — click to return to the site's home page; hidden when
         * already on the site root (or on the reader home). */}
        {url.trim() && !isSiteRoot(url) && (
          <button
            type="button"
            onClick={() => {
              try {
                // Domain root only — strips every path, query, and hash.
                const rootUrl = new URL(url).origin + '/';
                log('WebReader: back-to-home clicked', { fromUrl: url, rootUrl });
                handleLoad(rootUrl);
              } catch (e) {
                logwarn('WebReader: back-to-home could not parse URL', { url, error: e });
              }
            }}
            aria-label={t('action.back_to_home_page')}
            title={t('action.back_to_home_page')}
            className="flex h-9 flex-shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2 transition-colors hover:border-primary hover:bg-muted"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            {faviconUrl(url) && (
              <img
                src={faviconUrl(url)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-4 w-4 rounded-sm"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
              {t('action.back_to_home_page')}
            </span>
          </button>
        )}
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
          onLemmatize={handleLemmatize}
          onPageTranslate={handlePageTranslate}
        />
      )}

          {/* ── Empty state: suggested reading fills the space ── */}
          {!text && !loading && (
            <div className="flex w-full min-h-0 flex-1 flex-col">
              {suggestions && (
                <div className="min-h-0 w-full flex-1 overflow-y-auto pb-2 pr-1">
                  <p className="text-sm font-semibold text-muted-foreground">{t('title.suggested_reading')}</p>
                  <div className="mt-4 space-y-6">
                    {READING_CATEGORIES.map((category) => {
                      const items = suggestions[category];
                      if (!items?.length) return null;
                      return (
                        <section key={category}>
                          <h3 className="text-sm font-semibold text-foreground">
                            {t(`title.${category}` as any)}
                          </h3>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                            {items.map((item) => {
                              const favicon = faviconUrl(item.url);
                              return (
                                <button
                                  key={item.url}
                                  type="button"
                                  onClick={() => handleLoad(item.url)}
                                  title={item.url}
                                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-left text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                                >
                                  {favicon && (
                                    <img
                                      src={favicon}
                                      alt=""
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      className="h-4 w-4 flex-shrink-0 rounded-sm"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                  <span className="truncate">{item.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
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
