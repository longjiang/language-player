/**
 * Language Player — Page Tokenization Content Script
 *
 * Opt-in mode: turns visible text on any webpage into clickable L2 tokens.
 * Uses the same panel shell, DictionaryCard, SavedWordsProvider, and bottom
 * bar as video mode via mountPagePanel().
 */

import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';
import { t, setLocale, log, logwarn } from './i18n';
import { mountPagePanel, unmountPagePanel } from './transcript-app';

const VIDEO_HOST_RE = /(^|\.)(netflix\.com|primevideo\.com|amazon\.(com|co\.uk|de|co\.jp)|youtube\.com|disneyplus\.com|hulu\.com|max\.com|hbonow\.com|hbomax\.com)$/i;
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption, dt, dd';
const SKIP_SELECTOR = 'script, style, noscript, template, svg, canvas, iframe, input, textarea, select, [contenteditable]';

let initialized = false;
let enabled = false;
let l1Code = 'en';
let l2Code = 'en';
let panelRoot = null;
let observer = null;
let mutationTimer = null;
const tokenCache = new Map();
const tokenizedBlocks = new Set();
let nextBlockId = 1;
let pageTokenStats = { words: 0, withPron: 0 };

function isVideoHost() {
  try {
    return VIDEO_HOST_RE.test(location.hostname);
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

function getVisibleBlocks() {
  return [...document.querySelectorAll(BLOCK_SELECTOR)].filter((el) => {
    if (isHidden(el) || isInsideSkipped(el)) return false;
    if (el.querySelector(BLOCK_SELECTOR)) return false; // leaf blocks only
    return true;
  });
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
    span.textContent = token.text;
    span.dataset.tokenText = token.text;
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

  createPanel();
  window.dispatchEvent(new CustomEvent('lpv-page-lookup', {
    detail: {
      token: {
        text: token.text,
        lemmas: token.lemmas || [],
        pronunciation: token.pronunciation || null,
      },
      blockText,
      blockId,
      href,
    },
  }));
}

async function tokenizePage() {
  if (!enabled) return;
  const allCandidates = [...document.querySelectorAll(BLOCK_SELECTOR)];
  let hiddenCount = 0;
  let insideSkippedCount = 0;
  let nestedCount = 0;
  const skippedSamples = [];
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
    }
  }

  const blocks = allCandidates.filter((el) => {
    if (isHidden(el) || isInsideSkipped(el)) return false;
    if (el.querySelector(BLOCK_SELECTOR)) return false;
    return !tokenizedBlocks.has(el);
  });
  if (blocks.length === 0) return;

  log(`[PAGE] candidates=${allCandidates.length}, visibleLeaf=${blocks.length}, hidden=${hiddenCount}, insideSkipped=${insideSkippedCount}, nested=${nestedCount}${skippedSamples.length ? `, skippedSamples=[${skippedSamples.join(', ')}]` : ''}`);

  const blocksWithNodes = [];
  const emptyBlocks = [];
  for (const block of blocks) {
    block.__lpvOriginalHtml = block.innerHTML;
    if (!block.__lpvBlockId) block.__lpvBlockId = `block-${nextBlockId++}`;
    const nodes = getTextNodes(block);
    if (nodes.length > 0) {
      blocksWithNodes.push({ block, nodes });
      block.classList.add('lpv-page-tokenizing');
    } else {
      emptyBlocks.push(block);
      // Inspected once — don't re-discover persistent empty wrappers on every
      // page mutation (they show up as repeat "no tokenizable text" scans).
      tokenizedBlocks.add(block);
    }
  }
  if (emptyBlocks.length > 0) {
    log(`[PAGE] blocks with no tokenizable text: ${emptyBlocks.length}; sample=${emptyBlocks.slice(0, 5).map((block) => describeBlock(block)).join(' | ')}`);
  }
  if (blocksWithNodes.length === 0) return;
  const textNodes = blocksWithNodes.flatMap(({ nodes }) => nodes);
  log(`[PAGE] scanning: ${blocksWithNodes.length} blocks, ${textNodes.length} text nodes`);

  const uniqueTexts = [...new Set(textNodes.map((node) => node.nodeValue))];
  let resultsByText = new Map();
  try {
    const results = await fetchTokensForTexts(uniqueTexts, l2Code);
    uniqueTexts.forEach((text, i) => {
      tokenCache.set(`${l2Code}:${text}`, results[i] || []);
      resultsByText.set(text, results[i] || []);
    });
  } catch (err) {
    logwarn('Page tokenization failed:', err);
    for (const { block } of blocksWithNodes) {
      block.classList.remove('lpv-page-tokenizing');
    }
    return;
  }

  let renderedNodes = 0;
  pageTokenStats = { words: 0, withPron: 0 };
  for (const { block, nodes } of blocksWithNodes) {
    for (const node of nodes) {
      if (renderTextNode(node, resultsByText.get(node.nodeValue))) renderedNodes++;
    }
    block.classList.remove('lpv-page-tokenizing');
    tokenizedBlocks.add(block);
  }
  log(`[PAGE] rendered tokens into ${renderedNodes} DOM text nodes across ${blocksWithNodes.length} blocks`);
  log(`[FURIGANA] page mode: rendered ${pageTokenStats.words} word tokens (${pageTokenStats.withPron} with pronunciation) as plain clickable spans — no inline ruby on page text`);
}

function createPanel() {
  if (panelRoot) {
    panelRoot.classList.remove('lpv-collapsed');
    document.body.classList.add('lpv-panel-open');
    return;
  }

  panelRoot = document.createElement('div');
  panelRoot.id = 'lpv-transcript-panel';
  panelRoot.classList.add('lpv-page-panel');

  const header = document.createElement('div');
  header.id = 'lpv-panel-header';

  const title = document.createElement('span');
  title.id = 'lpv-panel-title';
  title.innerHTML = `<img id="lpv-panel-logo" src="${chrome.runtime.getURL('src/language-player-logo-64.png')}" alt="" width="24" height="24" />`;

  const right = document.createElement('div');
  right.id = 'lpv-header-right';

  const readBtn = document.createElement('a');
  readBtn.id = 'lpv-open-web-btn';
  readBtn.className = 'lpv-visible';
  readBtn.target = '_blank';
  readBtn.rel = 'noopener noreferrer';
  readBtn.href = `https://language-player.netlify.app/${encodeURIComponent(l1Code)}/${encodeURIComponent(l2Code)}/web-reader?url=${encodeURIComponent(location.href)}`;
  readBtn.textContent = t('readInLanguagePlayer');

  const closeBtn = document.createElement('button');
  closeBtn.id = 'lpv-close-btn';
  closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  closeBtn.title = t('closePanel');
  closeBtn.addEventListener('click', closePanel);

  right.appendChild(readBtn);
  right.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(right);

  const content = document.createElement('div');
  content.id = 'lpv-panel-content';

  panelRoot.appendChild(header);
  panelRoot.appendChild(content);
  document.body.appendChild(panelRoot);
  document.body.classList.add('lpv-panel-open');

  mountPagePanel(content, {
    l1Code,
    l2Code,
    pageUrl: location.href,
    onFollowLink: (href) => { location.href = href; },
  });
  log('[PAGE] side panel opened');
}

async function closePanel() {
  try {
    await chrome.storage.sync.set({ pageTokenizationEnabled: false });
  } catch {}
  cleanup();
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
  for (const block of tokenizedBlocks) {
    if (block.__lpvOriginalHtml !== undefined) {
      block.innerHTML = block.__lpvOriginalHtml;
    }
  }
  tokenizedBlocks.clear();
  tokenCache.clear();
  if (panelRoot) {
    unmountPagePanel();
    panelRoot.remove();
    panelRoot = null;
  }
  document.body.classList.remove('lpv-panel-open');
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
  if (isVideoHost()) return;

  const sync = await chrome.storage.sync.get('pageTokenizationEnabled');
  if (!sync.pageTokenizationEnabled) return;

  const local = await chrome.storage.local.get(['l1Language', 'l2Language', 'showPhonetics', 'showTranslation']);
  l1Code = local.l1Language || 'en';
  l2Code = local.l2Language || 'en';
  await setLocale(l1Code);

  enabled = true;
  log(`[PAGE] init: enabled=true, l2=${l2Code}, l1=${l1Code}`);
  await tokenizePage();
  createPanel();
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
});

init();
log('Page tokenization content script loaded');
