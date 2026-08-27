/**
 * Language Player — Page Tokenization Content Script
 *
 * Opt-in mode: turns visible text on any webpage into clickable L2 tokens.
 * Uses the same panel shell, DictionaryCard, SavedWordsProvider, and bottom
 * bar as video mode — rendered in the native side panel (src/sidepanel.jsx).
 */

import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';
import { setLocale, log, logwarn } from './i18n';
import { buildRuby, baseCode, sentenceContaining, shouldShowPhonetics, getWordDifficulty, setCachedEntries, getCachedEntries } from '@langplayer/utils';
import { selectionStartOffset } from './selection-utils';

const VIDEO_HOST_RE = /(^|\.)(netflix\.com|primevideo\.com|amazon\.(com|co\.uk|de|co\.jp)|youtube\.com|disneyplus\.com|hulu\.com|max\.com|hbonow\.com|hbomax\.com)$/i;
/** Language Player's own web assets — never tokenize these (mirrors popup.js). */
const OWN_HOST_RE = /(^|\.)(languageplayer\.io|language-player\.netlify\.app)$/i;
// Leaf text containers. `div` is included because many sites put whole article
// bodies in a bare <div> with <br> separators (e.g. sengoku-his.com's .desc) —
// the leaf-only filter below keeps wrapper divs (those containing other blocks)
// out, so only text-bearing leaf divs are tokenized.
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption, dt, dd, div';
const SKIP_SELECTOR = 'script, style, noscript, template, svg, canvas, iframe, input, textarea, select, [contenteditable], #lpv-transcript-panel';
/** Tokenize blocks this far before they scroll into view (matches web TokenizedText). */
const NEAR_VIEWPORT_MARGIN = '200px';
/** Coalesce bursts of newly-visible blocks into one batch request. */
const FLUSH_DELAY = 80;

let initialized = false;
let enabled = false;
let panelOpen = false;
let pageTranslationTabOpen = false;
let lifecycleGeneration = 0;
let l1Code = 'en';
let l2Code = 'en';
let showPhonetics = true;
/** Display "Show scope": 'all' (All words) or 'hard' (Hard words only). */
let phoneticsScope = 'all';
/** Learner's proficiency level (1–7) for the current L2, from progressLevels.
 *  0 = not set → hard-words scope shows all words. */
let userLevel = 0;
/** Unique lemmas/surface forms seen this flush, batched into one lookup. */
const pageLookupWords = new Set();
/** Furigana debug — log each unique (word, reason) once to keep the console readable. */
const pageFuriganaLogged = new Set();
function logPageFurigana(key, message) {
  if (pageFuriganaLogged.has(key)) return;
  pageFuriganaLogged.add(key);
  log(`[FURIGANA] ${message}`);
}
let observer = null;
let mutationTimer = null;
let io = null; // IntersectionObserver — tokenizes blocks as they near the viewport
let pendingBlocks = new Set(); // blocks queued for tokenization (awaiting fetch/render)
let flushTimer = null;
let tokenizing = false; // guard against overlapping flushes
const tokenCache = new Map();
const tokenizedBlocks = new Set();
let nextBlockId = 1;
let pageTokenStats = { words: 0, withPron: 0, rubyCount: 0 };
let pageTranslationStatus = 'idle'; // idle | loading | ready | empty | error
let pageTranslationError = null;

/** Cached tab id (via background) — used to open the side panel. */
let _tabId = null;
function getTabId() {
  return new Promise((resolve) => {
    if (_tabId) { resolve(_tabId); return; }
    chrome.runtime.sendMessage({ action: 'getTabId' }, (id) => {
      _tabId = id || null;
      resolve(_tabId);
    });
  });
}

/** Most recent token lookup — included in pageModeState pulls so the side
 *  panel doesn't lose a lookup that raced its open. */
let lastLookup = null;

function isVideoHost() {
  try {
    return VIDEO_HOST_RE.test(location.hostname);
  } catch {
    return false;
  }
}

function isOwnHost() {
  try {
    return OWN_HOST_RE.test(location.hostname);
  } catch {
    return false;
  }
}

function isLocalhost() {
  try {
    const host = location.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

function isHidden(el) {
  try {
    if (!el || el.getClientRects().length === 0) return true;
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  } catch {
    return true;
  }
}

/** True when `el` has a descendant matching BLOCK_SELECTOR that is NOT hidden.
 *  Used as the "is this a nested wrapper?" test. Hidden descendant blocks do
 *  NOT make `el` nested — otherwise a wrapper that only contains hidden
 *  sub-blocks (e.g. YouTube's always-hidden paid-comment-chip <div> inside a
 *  comment body) would be skipped as "nested", orphaning its *visible* text
 *  (the comment body <span>). */
function hasVisibleBlockDescendant(el) {
  try {
    const descendants = el.querySelectorAll(BLOCK_SELECTOR);
    for (const child of descendants) {
      if (!isHidden(child)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Detect the page's language before tokenizing (SPEC-…): `<html lang>`
 * first, then meta content-language / name=language. Returns the ISO 639-1
 * base code (e.g. "ja", "zh") or null when the page doesn't declare one.
 */
function detectPageLanguage() {
  try {
    const htmlLang = document.documentElement?.getAttribute?.('lang');
    const meta = document.querySelector('meta[http-equiv="content-language"], meta[name="language"]');
    const raw = (htmlLang || meta?.getAttribute?.('content') || '').trim();
    if (!raw) return null;
    const base = raw.toLowerCase().split(/[_-]/)[0];
    return /^[a-z]{2,3}$/.test(base) ? base : null;
  } catch {
    return null;
  }
}

/**
 * Page-language vs saved-L2 mismatch (null when the page declares no
 * language, or it matches the L2 base). Shown as a side-panel banner and
 * logged before tokenization starts.
 */
function pageLangMismatch() {
  try {
    const detected = detectPageLanguage();
    if (!detected) return null;
    const saved = (l2Code || 'en').split('-')[0].toLowerCase();
    if (detected === saved) return null;
    return { detected, saved };
  } catch {
    return null;
  }
}

function isInsideSkipped(el) {
  try {
    return !!el.closest(SKIP_SELECTOR);
  } catch {
    return false;
  }
}

function describeBlock(el) {
  const cls = typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
    : '';
  return `${el.tagName.toLowerCase()}${cls}${el.id ? '#' + el.id : ''}`;
}

function isNearViewport(el) {
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const margin = parseFloat(NEAR_VIEWPORT_MARGIN) || 200;
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
  } catch {
    return false;
  }
}

function getTextNodes(block) {
  const nodes = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = (node.nodeValue || '').trim();
      if (!value) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || isHidden(parent) || isInsideSkipped(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

async function fetchTokensForTexts(texts, l2) {
  const results = [];
  for (let i = 0; i < texts.length; i += 50) {
    const chunk = texts.slice(i, i + 50);
    log(`[PAGE] batch tokenize POST (${chunk.length} texts, l2=${l2.split('-')[0]})`);
    const res = await apiFetch(`${API_BASE}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: chunk, l2: l2.split('-')[0] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.push(...(data.results || []));
  }
  return results;
}

/** Collect a token's lemmas + surface form for the lazy batch dictionary lookup
 *  that powers the "hard words only" gate (and the shared dictionary cache).
 *  Only near-viewport (tokenized) blocks contribute, so the lookup is lazy. */
function collectLookupsForToken(token) {
  for (const lemma of token.lemmas || []) {
    if (lemma && typeof lemma.lemma === 'string' && lemma.lemma) pageLookupWords.add(lemma.lemma);
  }
  if (typeof token.text === 'string' && token.text) pageLookupWords.add(token.text);
}

/** Batch dictionary lookup for page words, routed through the background
 *  `bgFetch` relay (apiFetch) — bare `fetch` from a content script is subject
 *  to the page's CORS policy, so it is not used here. This populates the same
 *  cache that powers the "Hard words only" difficulty gate. On completion it
 *  re-renders phonetics once (hard words appear without retokenizing the page). */
async function lookupPageWords(words) {
  const base = baseCode(l2Code);
  const uncached = words.filter((w) => !getCachedEntries(base, w.text));
  if (uncached.length === 0) return;
  const res = await apiFetch(`${API_BASE}/dictionary/lookup-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words: uncached.map((w) => ({ text: w.text, l2: base })) }),
  });
  if (!res.ok) return;
  const data = await res.json();
  const results = data.results ?? {};
  for (const w of uncached) {
    const entries = results[w.text] ?? [];
    if (entries.length > 0) setCachedEntries(base, w.text, entries);
  }
  log(`[FURIGANA] page mode batch lookup: ${uncached.length} page words cached (${Object.keys(results).filter((k) => (results[k] || []).length > 0).length} found)`);
  if (phoneticsScope === 'hard') reRenderTokenPhonetics();
}

/** Re-scan all tokenized spans and look up their lemmas — used when the scope
 *  switches to "Hard words only" so already-tokenized text has dictionary data. */
function enqueueTokenizedPageLookups() {
  const words = new Set();
  for (const span of document.querySelectorAll('span.lpv-page-token')) {
    const raw = span.dataset.token;
    if (!raw) continue;
    let token;
    try { token = JSON.parse(raw); } catch { continue; }
    if (!token) continue;
    for (const lemma of token.lemmas || []) {
      if (lemma && typeof lemma.lemma === 'string' && lemma.lemma) words.add(lemma.lemma);
    }
    if (typeof token.text === 'string' && token.text) words.add(token.text);
  }
  if (words.size === 0) return;
  log(`[FURIGANA] page mode look up ${words.size} tokenized page words (hard-words scope)`);
  lookupPageWords([...words].map((word) => ({ text: word, l2Code: baseCode(l2Code) }))).catch(() => {});
}

function renderTextNode(node, tokens) {
  if (!tokens || tokens.length === 0) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  const frag = document.createDocumentFragment();
  for (const token of tokens) {
    if (!token || typeof token.text !== 'string') continue;
    if (/^\s*$/.test(token.text)) {
      frag.appendChild(document.createTextNode(token.text));
      continue;
    }
    const clickable = Array.isArray(token.lemmas) && token.lemmas.length > 0;
    if (!clickable) {
      frag.appendChild(document.createTextNode(token.text));
      continue;
    }
    pageTokenStats.words++;
    if (token.pronunciation) pageTokenStats.withPron++;
    // Collect this token's lemmas for the lazy batch dictionary lookup (same
    // pipeline as the video transcript: tokenize → batch lookup → cache → gate).
    collectLookupsForToken(token);
    const span = document.createElement('span');
    span.className = 'lpv-page-token';
    span.dataset.tokenText = token.text;
    // Keep the resolved token on the span so the phonetics toggle can
    // re-render ruby purely visually (no tokenCache lookup, no retokenize).
    try { span.dataset.token = JSON.stringify(token); } catch {}

    // Inline ruby/furigana — gated by the shared phonetics pipeline
    // (shouldShowPhonetics) so the "Hard words only" scope and the difficulty
    // decision match the video transcript exactly, not just the on/off toggle.
    const canRuby = shouldShowPhonetics({ phoneticsOn: showPhonetics, scope: phoneticsScope, userLevel, l2Code, lemmas: token.lemmas || [] })
      && token.pronunciation && token.pronunciation !== token.text;
    // Furigana debug: why is ruby (not) rendering under the hard-words scope?
    if (phoneticsScope === 'hard' && token.pronunciation && token.pronunciation !== token.text && !canRuby) {
      const diff = getWordDifficulty(baseCode(l2Code), token.lemmas || []);
      if (diff.kind === 'not_cached') {
        logPageFurigana(`page:${token.text}:notCached`, `"${token.text}" page ruby deferred: hard-words scope waiting for batch lookup (userLevel=${userLevel})`);
      } else {
        logPageFurigana(`page:${token.text}:notHard`, `"${token.text}" page ruby skipped: hard-words scope filtered it (diff=${JSON.stringify(diff)}, userLevel=${userLevel})`);
      }
    }
    let rubyRendered = false;
    if (canRuby) {
      const segments = buildRuby(token.text, token.pronunciation, l2Code);
      if (segments.some((seg) => seg.reading)) {
        rubyRendered = true;
        for (const seg of segments) {
          if (seg.reading) {
            const ruby = document.createElement('ruby');
            ruby.appendChild(document.createTextNode(seg.text));
            const rt = document.createElement('rt');
            rt.textContent = seg.reading;
            ruby.appendChild(rt);
            span.appendChild(ruby);
          } else {
            span.appendChild(document.createTextNode(seg.text));
          }
        }
      }
    }
    if (!rubyRendered) span.textContent = token.text;
    if (rubyRendered) pageTokenStats.rubyCount++;

    span.addEventListener('click', (e) => onTokenClick(e, token, parent));
    frag.appendChild(span);
  }
  parent.replaceChild(frag, node);
  return true;
}

function normalizeBlockText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/** Visible text of a block, from non-skipped text nodes only. `innerText` can
 *  be empty while `textContent` is a big non-rendered blob — e.g. a wrapper
 *  around YouTube's `<script type="application/ld+json">` VideoObject that
 *  would otherwise surface as a page-translation line. Walking text nodes
 *  through the same SKIP_SELECTOR / hidden filter as the tokenizer excludes
 *  scripts, styles, templates, and hidden subtrees; ruby `<rt>` readings are
 *  excluded too so the text matches what the learner sees (no glosses). */
function getVisibleBlockText(el) {
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.closest?.('rt, .select-none')) return NodeFilter.FILTER_REJECT;
        const value = (node.nodeValue || '').trim();
        if (!value) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || isHidden(parent) || isInsideSkipped(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return normalizeBlockText(parts.join(' '));
  } catch {
    return normalizeBlockText(el.textContent || '');
  }
}

/** Return source blocks for the side-panel translation view. This reads the
 * page DOM from the page content script, never from the side-panel document.
 * The cap keeps runtime message payloads bounded on very large pages. */
function getPageTranslationSnapshot() {
  const blocks = [];
  let totalChars = 0;
  for (const el of document.querySelectorAll(BLOCK_SELECTOR)) {
    if (blocks.length >= 300 || isHidden(el) || isInsideSkipped(el) || hasVisibleBlockDescendant(el)) continue;
    const text = getVisibleBlockText(el);
    if (!text || text.length < 2) continue;
    const clipped = text.slice(0, 2000);
    if (totalChars + clipped.length > 180000) break;
    if (!el.__lpvBlockId) el.__lpvBlockId = `block-${nextBlockId++}`;
    const anchor = el.closest('a[href]');
    blocks.push({ id: el.__lpvBlockId, text: clipped, href: anchor?.href || null });
    totalChars += clipped.length;
  }
  return blocks;
}

function onTokenClick(e, token, textNodeParent) {
  e.preventDefault();
  e.stopPropagation();

  const anchor = textNodeParent?.closest?.('a[href]');
  const href = anchor ? anchor.href : null;
  const block = textNodeParent?.closest?.(BLOCK_SELECTOR) || textNodeParent;
  // Serve the context from the source text captured at tokenization, not from
  // the live (tokenized + ruby) DOM — otherwise the context sentence includes
  // ruby readings.
  const blockText = block?.__lpvSourceText || getVisibleBlockText(block);
  const blockId = block?.__lpvBlockId || null;

  const payload = {
    token: {
      text: token.text,
      lemmas: token.lemmas || [],
      pronunciation: token.pronunciation || null,
    },
    blockText,
    blockId,
    href,
    l1Code,
    l2Code,
    pageUrl: location.href,
  };
  lastLookup = payload;
  window.dispatchEvent(new CustomEvent('lpv-page-dictionary-open', { detail: payload }));
  try {
    chrome.runtime.sendMessage({ action: 'pageLookup', payload }).catch(() => {});
  } catch {}

  // Open the native side panel — this click is a user gesture, which
  // chrome.sidePanel.open() requires (Chrome 116+).
  getTabId().then((tid) => {
    if (!tid) return;
    try {
      if (chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tid });
    } catch {}
  });
}

let pageSelectionHandler = null;

/** Drag-select → dictionary popup on tokenized page text (SPEC-033). Selecting
 *  any portion of tokenized page text opens the dictionary with the selection
 *  as the lookup term (no lemma), context = the sentence containing it. */
function attachPageSelectionListener() {
  if (pageSelectionHandler) return;
  pageSelectionHandler = (e) => {
    if (!enabled) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const anchorEl = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    // Only selections inside tokenized page text open the popup.
    if (!anchorEl?.closest?.('.lpv-page-token')) return;
    const text = sel.toString().trim();
    if (!text) return;
    const tokenEl = anchorEl.closest('.lpv-page-token');
    const block = anchorEl.closest?.(BLOCK_SELECTOR) || tokenEl;
    const blockText = block?.__lpvSourceText || getVisibleBlockText(block);
    const offset = selectionStartOffset(block, range);
    const hit = offset !== null && blockText.slice(offset).startsWith(text)
      ? offset
      : blockText.indexOf(text);
    const contextText = hit !== -1
      ? sentenceContaining(blockText, hit, baseCode(l2Code))
      : blockText;
    const blockId = block?.__lpvBlockId || null;
    const link = block?.closest?.('a[href]');
    const href = link?.href || null;
    const payload = {
      token: { text, lemmas: [], pronunciation: null },
      blockText: contextText,
      blockId,
      href,
      l1Code,
      l2Code,
      pageUrl: location.href,
    };
    log(`[PAGE] selection lookup: "${text}" | context chars=${contextText.length}`);
    lastLookup = payload;
    window.dispatchEvent(new CustomEvent('lpv-page-dictionary-open', { detail: payload }));
    try {
      chrome.runtime.sendMessage({ action: 'pageLookup', payload }).catch(() => {});
    } catch {}
    getTabId().then((tid) => {
      if (!tid) return;
      try {
        if (chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tid });
      } catch {}
    });
    // Collapse the native selection so the popup doesn't re-open on a stray
    // mouseup over the still-highlighted text.
    window.getSelection()?.removeAllRanges();
  };
  // pointerup handles both mouse and touch; defer so the selection is settled.
  document.addEventListener('pointerup', pageSelectionHandler, true);
}

function detachPageSelectionListener() {
  if (!pageSelectionHandler) return;
  document.removeEventListener('pointerup', pageSelectionHandler, true);
  pageSelectionHandler = null;
}

function onIntersect(entries) {
  if (!enabled || !panelOpen) return;
  let queued = false;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    if (tokenizedBlocks.has(el) || pendingBlocks.has(el)) continue;
    if (isHidden(el) || isInsideSkipped(el)) continue;
    if (hasVisibleBlockDescendant(el)) continue; // became nested — children tokenize as their own leaf blocks
    pendingBlocks.add(el);
    queued = true;
  }
  if (queued) scheduleFlush();
}

function ensureIo() {
  if (!io) {
    io = new IntersectionObserver(onIntersect, { rootMargin: NEAR_VIEWPORT_MARGIN });
  }
  return io;
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPending, FLUSH_DELAY);
}

async function flushPending() {
  flushTimer = null;
  if (!enabled || !panelOpen || tokenizing || pendingBlocks.size === 0) return;
  tokenizing = true;
  const blocks = [...pendingBlocks];
  pendingBlocks.clear();
  try {
    const blocksWithNodes = [];
    const emptyBlocks = [];
    for (const block of blocks) {
      if (tokenizedBlocks.has(block)) continue;
      if (hasVisibleBlockDescendant(block)) continue; // became nested — leave to its leaf children
      if (block.__lpvOriginalHtml === undefined) block.__lpvOriginalHtml = block.innerHTML;
      if (!block.__lpvBlockId) block.__lpvBlockId = `block-${nextBlockId++}`;
      const nodes = getTextNodes(block);
      if (nodes.length > 0) {
        // Capture the block's *source* text once, before the text nodes are
        // replaced by token spans. The lookup context is served from this
        // stored value instead of re-reading the (now tokenized, ruby-laden)
        // DOM on every token click / selection (SPEC-033 context parity).
        if (block.__lpvSourceText === undefined) block.__lpvSourceText = getVisibleBlockText(block);
        blocksWithNodes.push({ block, nodes });
        block.classList.add('lpv-page-tokenizing');
      } else {
        emptyBlocks.push(block);
        // Inspected once — don't re-discover persistent empty wrappers on
        // later mutations (they'd show up as repeat "no tokenizable text" scans).
        tokenizedBlocks.add(block);
        io?.unobserve(block);
      }
    }
    if (emptyBlocks.length > 0) {
      log(`[PAGE] blocks with no tokenizable text: ${emptyBlocks.length}; sample=${emptyBlocks.slice(0, 5).map((block) => describeBlock(block)).join(' | ')}`);
    }
    if (blocksWithNodes.length === 0) return;

    const textNodes = blocksWithNodes.flatMap(({ nodes }) => nodes);
    log(`[PAGE] tokenizing ${blocksWithNodes.length} blocks, ${textNodes.length} text nodes`);

    // Only fetch texts not already in the token cache — repeats (the same
    // paragraph seen again, or a re-render after toggling phonetics) are free.
    const uniqueTexts = [...new Set(textNodes.map((node) => node.nodeValue))];
    const missing = uniqueTexts.filter((text) => !tokenCache.has(`${l2Code}:${text}`));
    if (missing.length > 0) {
      const results = await fetchTokensForTexts(missing, l2Code);
      if (!enabled) {
        for (const { block } of blocksWithNodes) block.classList.remove('lpv-page-tokenizing');
        return; // toggled off mid-fetch — discard everything
      }
      missing.forEach((text, i) => {
        tokenCache.set(`${l2Code}:${text}`, results[i] || []);
      });
    }

    const statsBefore = { ...pageTokenStats };
    let renderedNodes = 0;
    for (const { block, nodes } of blocksWithNodes) {
      for (const node of nodes) {
        if (renderTextNode(node, tokenCache.get(`${l2Code}:${node.nodeValue}`))) renderedNodes++;
      }
      block.classList.remove('lpv-page-tokenizing');
      tokenizedBlocks.add(block);
      io?.unobserve(block);
    }
    log(`[PAGE] rendered tokens into ${renderedNodes} DOM text nodes across ${blocksWithNodes.length} blocks`);
    const delta = {
      words: pageTokenStats.words - statsBefore.words,
      withPron: pageTokenStats.withPron - statsBefore.withPron,
      rubyCount: pageTokenStats.rubyCount - statsBefore.rubyCount,
    };
    log(`[FURIGANA] page mode: rendered ${delta.words} word tokens (${delta.withPron} with pronunciation, ${delta.rubyCount} with inline ruby) as clickable spans`);

    // Lazy batch dictionary lookup for the words just tokenized (near-viewport
    // only). This populates the shared cache that powers the "Hard words only"
    // difficulty gate — identical pipeline to the video transcript. Only words
    // actually rendered are looked up, so the request is proportional to what
    // the learner can see.
    if (pageLookupWords.size > 0) {
      const words = [...pageLookupWords].map((word) => ({ text: word, l2Code: baseCode(l2Code) }));
      log(`[PAGE] batch dictionary lookup for ${words.length} page words`);
      lookupPageWords(words).catch(() => {});
      pageLookupWords.clear();
    }
  } catch (err) {
    logwarn('Page tokenization failed:', err);
    for (const block of blocks) {
      block.classList.remove('lpv-page-tokenizing');
      // Leave the block unwatched: the next mutation re-discovers it, and
      // scrolling away and back retries it if the failure was transient.
      io?.unobserve(block);
    }
  } finally {
    tokenizing = false;
    if (enabled && pendingBlocks.size > 0) scheduleFlush();
  }
}

async function tokenizePage() {
  if (!enabled || !panelOpen) return;
  const ioInstance = ensureIo();
  const allCandidates = [...document.querySelectorAll(BLOCK_SELECTOR)];
  let hiddenCount = 0;
  let insideSkippedCount = 0;
  let nestedCount = 0;
  const skippedSamples = [];
  const leafVisible = [];
  for (const el of allCandidates) {
    if (isHidden(el)) {
      hiddenCount++;
      if (skippedSamples.length < 5) skippedSamples.push(`${describeBlock(el)}:hidden`);
    } else if (isInsideSkipped(el)) {
      insideSkippedCount++;
      if (skippedSamples.length < 5) skippedSamples.push(`${describeBlock(el)}:insideSkipped`);
    } else if (hasVisibleBlockDescendant(el)) {
      nestedCount++;
      if (skippedSamples.length < 5) skippedSamples.push(`${describeBlock(el)}:nested`);
    } else {
      leafVisible.push(el);
    }
  }
  log(`[PAGE] candidates=${allCandidates.length}, leafVisible=${leafVisible.length}, hidden=${hiddenCount}, insideSkipped=${insideSkippedCount}, nested=${nestedCount}${skippedSamples.length ? `, skippedSamples=[${skippedSamples.join(', ')}]` : ''}`);

  // Watch every leaf block for scroll-into-view; queue the ones already near
  // the viewport so the first render doesn't depend on the observer's async
  // initial callback. Off-screen blocks stay plain text until scrolled to —
  // lazy tokenization keeps the page fetch/render cost proportional to what
  // the user can actually see.
  let queued = 0;
  for (const el of leafVisible) {
    if (tokenizedBlocks.has(el) || pendingBlocks.has(el)) continue;
    ioInstance.observe(el);
    if (isNearViewport(el)) {
      pendingBlocks.add(el);
      queued++;
    }
  }
  if (queued > 0 || pendingBlocks.size > 0) scheduleFlush();
}

/** Push page-mode state to the side panel (via the background relay) so it
 *  can render the PagePanel when opened on this tab. Includes the page-lang
 *  vs L2 mismatch so the panel can warn before the user taps a token. */
function pushPageModeState() {
  // On a video host the side panel already owns the video mode (subtitles).
  // Pushing a page-mode state would flip the panel out of video mode and hide
  // the subtitles tab, so the page content script must not claim the mode. The
  // side panel still gets page data through the dedicated pageLookup message
  // and getPageTranslationSnapshot response.
  if (isVideoHost()) return;
  try {
    chrome.runtime.sendMessage({
      action: 'pageModeState',
      state: {
        mode: 'page',
        l1Code,
        l2Code,
        pageUrl: location.href,
        lookup: lastLookup,
        mismatch: pageLangMismatch(),
        pageTranslationStatus,
        pageTranslationError,
      },
    }).catch(() => {});
  } catch {}
}

function cleanup() {
  lifecycleGeneration++;
  initialized = false;
  enabled = false;
  pageLookupWords.clear();
  log(`[PAGE] cleanup: restoring ${tokenizedBlocks.size} tokenized blocks (enabled=false, panelOpen=${panelOpen}, pageTranslationTabOpen=${pageTranslationTabOpen}); page tokenization + translation stopped`);
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (mutationTimer) {
    clearTimeout(mutationTimer);
    mutationTimer = null;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (io) {
    io.disconnect();
    io = null;
  }
  for (const block of pendingBlocks) block.classList.remove('lpv-page-tokenizing');
  pendingBlocks.clear();
  tokenizing = false;
  detachPageSelectionListener();
  restoreTokens();
  tokenCache.clear();
  lastLookup = null;
  pageTranslationStatus = 'idle';
  pageTranslationError = null;
  window.dispatchEvent(new CustomEvent('lpv-page-dictionary-close'));
}

function restoreTokens() {
  for (const block of tokenizedBlocks) {
    if (block.__lpvOriginalHtml !== undefined) {
      block.innerHTML = block.__lpvOriginalHtml;
    }
  }
  tokenizedBlocks.clear();
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (!enabled || !panelOpen) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => tokenizePage(), 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function init() {
  if (initialized) return;
  initialized = true;
  const generation = lifecycleGeneration;
  // Page translation is a feature of the page, not of the video player, so it
  // must run on video hosts too (SPEC-086 §2.2: available on every ordinary
  // http/https page). Only Language Player's own assets and localhost are
  // skipped. On a video host the page content script tokenizes the page
  // (title/description/comments) for the popup dictionary and provides the
  // page-translation snapshot, while content-entry.js keeps owning the video
  // subtitles mode.
  if (isOwnHost() || isLocalhost()) {
    log(`[PAGE] init skipped: host=${location.hostname} (${isOwnHost() ? 'own asset' : 'localhost'})`);
    return;
  }
  if (isVideoHost()) {
    log(`[PAGE] init on video host ${location.hostname}: page translation + tokenization enabled`);
  }
  if (!panelOpen || !pageTranslationTabOpen) {
    log(`[PAGE] init skipped: panelOpen=${panelOpen}, pageTranslationTabOpen=${pageTranslationTabOpen}`);
    return;
  }

  const local = await chrome.storage.local.get(['l1Language', 'l2Language', 'showPhonetics', 'showTranslation', 'phoneticsScope', 'progressLevels']);
  if (generation !== lifecycleGeneration || !panelOpen || !pageTranslationTabOpen) {
    log('[PAGE] init cancelled before preferences completed');
    return;
  }
  l1Code = local.l1Language || 'en';
  l2Code = local.l2Language || 'en';
  showPhonetics = local.showPhonetics !== false;
  phoneticsScope = local.phoneticsScope === 'hard' ? 'hard' : 'all';
  const lv = (local.progressLevels || {})[l2Code];
  userLevel = (typeof lv === 'number' && lv >= 1 && lv <= 7) ? lv : 0;
  await setLocale(l1Code);
  if (generation !== lifecycleGeneration || !panelOpen || !pageTranslationTabOpen) {
    log('[PAGE] init cancelled after locale load');
    return;
  }

  enabled = true;
  pageTranslationStatus = 'ready';
  pageTranslationError = null;
  log(`[PAGE] init: enabled=true, l2=${l2Code}, l1=${l1Code}, showPhonetics=${showPhonetics}, phoneticsScope=${phoneticsScope}, userLevel=${userLevel}`);
  // Warn BEFORE tokenizing when the page declares a language different from
  // the saved L2 — the side panel shows a banner with a one-tap switch.
  const mismatch = pageLangMismatch();
  if (mismatch) {
    logwarn(`[PAGE] ⚠️ page language ${mismatch.detected} ≠ saved L2 ${mismatch.saved} — tokenizing as ${l2Code} anyway; panel shows the mismatch banner`);
  }
  await tokenizePage();
  attachPageSelectionListener();
  pushPageModeState();
  startObserver();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pageTokenizationOn') {
    log('[PAGE] legacy tokenization-on request received; lifecycle gate still required');
    initialized = false;
    init().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'openPageModal') {
    log(`[PAGE] opening page modal: ${message.modal?.kind || 'unknown'}`);
    window.dispatchEvent(new CustomEvent('lpv-page-modal-open', { detail: message.modal }));
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'pageTokenizationOff') {
    log('[PAGE] toggle disabled from popup');
    cleanup();
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'panelOpenState') {
    panelOpen = message.open === true;
    log(`[PAGE] panel lifecycle: open=${panelOpen}, pageTranslationTabOpen=${pageTranslationTabOpen}, enabled=${enabled}`);
    if (!panelOpen) {
      // Side panel closed — stop all page tokenization/translation immediately.
      // The IntersectionObserver, MutationObserver, pending flush timers, and
      // token cache are all torn down and every token span is restored, so
      // scrolling no longer tokenizes any further page text.
      pageTranslationTabOpen = false;
      cleanup();
    } else if (pageTranslationTabOpen) {
      initialized = false;
      init();
    }
    sendResponse({ ok: true, enabled });
    return true;
  }
  if (message.action === 'pageTranslationVisibility') {
    pageTranslationTabOpen = message.open === true;
    log(`[PAGE] page translation tab visibility: open=${pageTranslationTabOpen}, panelOpen=${panelOpen}`);
    if (panelOpen && pageTranslationTabOpen) {
      initialized = false;
      init();
    } else {
      cleanup();
    }
    sendResponse({ ok: true, enabled });
    return true;
  }
  if (message.action === 'getPanelState') {
    // Side panel pulled state (open, tab switch, navigation).
    sendResponse({
      state: panelOpen && !isVideoHost() && !isOwnHost() && !isLocalhost()
        ? { mode: 'page', l1Code, l2Code, pageUrl: location.href, lookup: lastLookup, mismatch: pageLangMismatch(), pageTranslationStatus, pageTranslationError }
        : null,
    });
    return true;
  }
  if (message.action === 'pageTranslationStart') {
    if (!enabled) {
      sendResponse({ ok: false, error: 'page interactivity is disabled' });
      return true;
    }
    pageTranslationStatus = 'ready';
    pageTranslationError = null;
    pushPageModeState();
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'getPageTranslationSnapshot') {
    if (!enabled || !panelOpen || !pageTranslationTabOpen) {
      log(`[PAGE] snapshot rejected: enabled=${enabled}, panelOpen=${panelOpen}, pageTranslationTabOpen=${pageTranslationTabOpen}, host=${location.hostname}`);
      sendResponse({ ok: false, error: 'page translation is not active' });
      return true;
    }
    const blocks = getPageTranslationSnapshot();
    log(`[PAGE] snapshot returned ${blocks.length} blocks (l2=${l2Code}, l1=${l1Code})`);
    sendResponse({ ok: true, pageUrl: location.href, blocks });
    return true;
  }
  if (message.action === 'changeLanguage') {
    // One-tap switch from the side-panel mismatch banner (page mode). Persist
    // the preference; the storage.onChanged handler below re-inits with the
    // new L2.
    log(`[PAGE] language change via mismatch banner: ${message.l1 ?? l1Code} → ${message.l2}`);
    if (message.l1 && message.l1 !== l1Code) {
      l1Code = message.l1;
      try { chrome.storage.local.set({ l1Language: message.l1 }); } catch {}
    }
    if (message.l2 && message.l2 !== l2Code) {
      try { chrome.storage.local.set({ l2Language: message.l2 }); } catch {}
    }
    sendResponse({ success: true });
    return true;
  }
  if (message.action === 'pageFollowLink') {
    // "Follow link" from the side panel's dictionary card.
    if (message.href) location.href = message.href;
    sendResponse({ ok: true });
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.pageTokenizationEnabled) {
    if (changes.pageTokenizationEnabled.newValue) {
      log('[PAGE] storage: legacy pageTokenizationEnabled → true; waiting for panel lifecycle gate');
      initialized = false;
      init();
    } else {
      log('[PAGE] storage: legacy pageTokenizationEnabled → false; restoring page');
      cleanup();
    }
  }
  if (area === 'local' && changes.l2Language && panelOpen && pageTranslationTabOpen) {
    l2Code = changes.l2Language.newValue || l2Code;
    cleanup();
    initialized = false;
    init();
  }
  if (area === 'local' && changes.showPhonetics && enabled) {
    showPhonetics = changes.showPhonetics.newValue !== false;
    // Purely visual toggle: re-render the ruby inside the existing token
    // spans. No restoreTokens() + tokenizePage() round-trip — the spans keep
    // their click listeners, off-screen blocks stay untouched, and nothing
    // is re-fetched or re-tokenized.
    reRenderTokenPhonetics();
  }
  if (area === 'local' && changes.phoneticsScope && enabled) {
    phoneticsScope = changes.phoneticsScope.newValue === 'hard' ? 'hard' : 'all';
    log(`[FURIGANA] page mode phonetics scope → ${phoneticsScope}`);
    // On switching to "Hard words only", make sure already-tokenized text has
    // dictionary data (the gate needs it); on 'all' it's a pure visual change.
    if (phoneticsScope === 'hard') enqueueTokenizedPageLookups();
    reRenderTokenPhonetics();
  }
  if (area === 'local' && changes.progressLevels && enabled) {
    const lv = (changes.progressLevels.newValue || {})[l2Code];
    userLevel = (typeof lv === 'number' && lv >= 1 && lv <= 7) ? lv : 0;
    log(`[FURIGANA] page mode userLevel → ${userLevel}`);
    reRenderTokenPhonetics();
  }
});

/**
 * Re-render ruby/furigana in the existing token spans after the phonetics
 * toggle. Each span carries its resolved token in `data-token`, so the
 * re-render is a pure DOM update — no tokenization, no network, no layout
 * re-scan.
 */
function reRenderTokenPhonetics() {
  const spans = document.querySelectorAll('span.lpv-page-token');
  let withRuby = 0;
  for (const span of spans) {
    const raw = span.dataset.token;
    if (!raw) continue;
    let token;
    try { token = JSON.parse(raw); } catch { continue; }
    if (!token || typeof token.text !== 'string') continue;
    const canRuby = shouldShowPhonetics({ phoneticsOn: showPhonetics, scope: phoneticsScope, userLevel, l2Code, lemmas: (token.lemmas || []) })
      && !!token.pronunciation && token.pronunciation !== token.text;
    if (!canRuby) {
      span.textContent = token.text;
      continue;
    }
    const segments = buildRuby(token.text, token.pronunciation, l2Code);
    if (!segments.some((seg) => seg.reading)) {
      span.textContent = token.text;
      continue;
    }
    span.textContent = '';
    for (const seg of segments) {
      if (seg.reading) {
        const ruby = document.createElement('ruby');
        ruby.appendChild(document.createTextNode(seg.text));
        const rt = document.createElement('rt');
        rt.textContent = seg.reading;
        ruby.appendChild(rt);
        span.appendChild(ruby);
      } else {
        span.appendChild(document.createTextNode(seg.text));
      }
    }
    withRuby++;
  }
  log(`[FURIGANA] page mode showPhonetics → ${showPhonetics}; re-rendered ${spans.length} token spans (${withRuby} with ruby) — no retokenization`);
}

init();
log('Page tokenization content script loaded');
