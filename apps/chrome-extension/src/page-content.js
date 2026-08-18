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
import { buildRuby } from '@langplayer/utils';

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
let l1Code = 'en';
let l2Code = 'en';
let showPhonetics = true;
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
    const span = document.createElement('span');
    span.className = 'lpv-page-token';
    span.dataset.tokenText = token.text;

    // Inline ruby/furigana, gated by the same showPhonetics pref as video mode.
    let rubyRendered = false;
    if (showPhonetics && token.pronunciation && token.pronunciation !== token.text) {
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

function onTokenClick(e, token, textNodeParent) {
  e.preventDefault();
  e.stopPropagation();

  const anchor = textNodeParent?.closest?.('a[href]');
  const href = anchor ? anchor.href : null;
  const block = textNodeParent?.closest?.(BLOCK_SELECTOR) || textNodeParent;
  const blockText = normalizeBlockText(block?.innerText || block?.textContent || '');
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
  };
  lastLookup = payload;
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

function onIntersect(entries) {
  if (!enabled) return;
  let queued = false;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    if (tokenizedBlocks.has(el) || pendingBlocks.has(el)) continue;
    if (isHidden(el) || isInsideSkipped(el)) continue;
    if (el.querySelector(BLOCK_SELECTOR)) continue; // became nested — children tokenize as their own leaf blocks
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
  if (!enabled || tokenizing || pendingBlocks.size === 0) return;
  tokenizing = true;
  const blocks = [...pendingBlocks];
  pendingBlocks.clear();
  try {
    const blocksWithNodes = [];
    const emptyBlocks = [];
    for (const block of blocks) {
      if (tokenizedBlocks.has(block)) continue;
      if (block.querySelector(BLOCK_SELECTOR)) continue; // became nested — leave to its leaf children
      if (block.__lpvOriginalHtml === undefined) block.__lpvOriginalHtml = block.innerHTML;
      if (!block.__lpvBlockId) block.__lpvBlockId = `block-${nextBlockId++}`;
      const nodes = getTextNodes(block);
      if (nodes.length > 0) {
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
  if (!enabled) return;
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
    } else if (el.querySelector(BLOCK_SELECTOR)) {
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
 *  can render the PagePanel when opened on this tab. */
function pushPageModeState() {
  try {
    chrome.runtime.sendMessage({
      action: 'pageModeState',
      state: {
        mode: 'page',
        l1Code,
        l2Code,
        pageUrl: location.href,
        lookup: lastLookup,
      },
    }).catch(() => {});
  } catch {}
}

function cleanup() {
  enabled = false;
  log(`[PAGE] cleanup: restoring ${tokenizedBlocks.size} tokenized blocks`);
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
  restoreTokens();
  tokenCache.clear();
  lastLookup = null;
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
    if (!enabled) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => tokenizePage(), 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function init() {
  if (initialized) return;
  initialized = true;
  if (isVideoHost() || isOwnHost() || isLocalhost()) {
    log(`[PAGE] init skipped: host=${location.hostname} (${isVideoHost() ? 'video' : isOwnHost() ? 'own asset' : 'localhost'})`);
    return;
  }

  const sync = await chrome.storage.sync.get('pageTokenizationEnabled');
  if (!sync.pageTokenizationEnabled) return;

  const local = await chrome.storage.local.get(['l1Language', 'l2Language', 'showPhonetics', 'showTranslation']);
  l1Code = local.l1Language || 'en';
  l2Code = local.l2Language || 'en';
  showPhonetics = local.showPhonetics !== false;
  await setLocale(l1Code);

  enabled = true;
  log(`[PAGE] init: enabled=true, l2=${l2Code}, l1=${l1Code}, showPhonetics=${showPhonetics}`);
  await tokenizePage();
  pushPageModeState();
  startObserver();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pageTokenizationOn') {
    log('[PAGE] toggle enabled from popup');
    initialized = false;
    init().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'pageTokenizationOff') {
    log('[PAGE] toggle disabled from popup');
    cleanup();
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'getPanelState') {
    // Side panel pulled state (open, tab switch, navigation).
    sendResponse({
      state: enabled
        ? { mode: 'page', l1Code, l2Code, pageUrl: location.href, lookup: lastLookup }
        : null,
    });
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
      log('[PAGE] storage: pageTokenizationEnabled → true');
      initialized = false;
      init();
    } else {
      log('[PAGE] storage: pageTokenizationEnabled → false');
      cleanup();
    }
  }
  if (area === 'local' && changes.l2Language && enabled) {
    l2Code = changes.l2Language.newValue || l2Code;
    cleanup();
    initialized = false;
    init();
  }
  if (area === 'local' && changes.showPhonetics && enabled) {
    showPhonetics = changes.showPhonetics.newValue !== false;
    log(`[FURIGANA] page mode showPhonetics → ${showPhonetics}; re-rendering visible page tokens (off-screen blocks re-tokenize on scroll)`);
    restoreTokens();
    tokenizePage();
  }
});

init();
log('Page tokenization content script loaded');
