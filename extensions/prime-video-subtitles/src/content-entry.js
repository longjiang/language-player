/**
 * Prime Video Subtitle Viewer — Content Script (React edition)
 *
 * This is the esbuild entry point. It bundles React + @langplayer/*
 * into a single content script that Chrome loads directly.
 *
 * Injects a collapsible transcript panel alongside the Prime Video player.
 * Parses TTML/XML subtitle files detected by the background service worker,
 * displays time-synced transcript entries with tokenized, clickable text,
 * and supports click-to-seek.
 *
 * The panel shell + subtitle parsing is vanilla JS.
 * The transcript rendering inside the panel is React (TranscriptApp).
 */

import { mountTranscript, unmountTranscript } from './transcript-app';

// ── State ────────────────────────────────────────────────────────────────
const STATE = {
  cues: [],           // parsed subtitle cues: { start, end, text }
  activeCueIdx: -1,   // index of currently active cue
  panelVisible: false,
  panelReady: false,
  subtitleUrl: null,
  loading: false,
};

// ── DOM refs ─────────────────────────────────────────────────────────────
let panelRoot = null;
let panelContent = null;
let toggleBtn = null;
let statusEl = null;

// ── L2 language detection ────────────────────────────────────────────────
let detectedL2Code = 'en';

/** Try to detect the subtitle language from page metadata */
function detectL2Code() {
  // Check for lang attribute on html element
  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    const code = htmlLang.split('-')[0];
    if (code) { detectedL2Code = code; return; }
  }
  // Check og:locale meta
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) {
    const code = ogLocale.getAttribute('content')?.split('_')[0];
    if (code) { detectedL2Code = code; return; }
  }
  // Fallback: try subtitle filename heuristics later
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Parse a TTML time string like "00:01:23.456" or "1.5s" to seconds */
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;

  const hmsMatch = timeStr.match(/^(\d{1,}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    let ms = hmsMatch[4];
    while (ms.length < 3) ms += '0';
    return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
  }

  const msMatch = timeStr.match(/^(\d{1,}):(\d{2})[.,](\d{1,3})$/);
  if (msMatch) {
    const m = parseInt(msMatch[1], 10);
    const s = parseInt(msMatch[2], 10);
    let ms = msMatch[3];
    while (ms.length < 3) ms += '0';
    return m * 60 + s + parseInt(ms, 10) / 1000;
  }

  const unitMatch = timeStr.match(/^([\d.]+)(s|ms|h|m)$/);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    const unit = unitMatch[2];
    if (unit === 'h') return val * 3600;
    if (unit === 'm') return val * 60;
    if (unit === 'ms') return val / 1000;
    return val;
  }

  const num = parseFloat(timeStr);
  return isNaN(num) ? 0 : num;
}

function stripTags(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').trim();
}

function decodeEntities(text) {
  if (!text) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

function parseTTML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const htmlDoc = parser.parseFromString(xmlText, 'text/html');
    return extractCuesFromDoc(htmlDoc);
  }
  return extractCuesFromDoc(doc);
}

function extractCuesFromDoc(doc) {
  const cues = [];
  const paragraphs = doc.querySelectorAll('p');
  for (const p of paragraphs) {
    const begin = p.getAttribute('begin') || p.getAttribute('start') || '';
    const end = p.getAttribute('end') || p.getAttribute('dur') || '';
    const text = stripTags(p.innerHTML || p.textContent || '');
    if (text && begin) {
      const startTime = parseTimeToSeconds(begin);
      let endTime = end ? parseTimeToSeconds(end) : null;
      if (p.getAttribute('dur') && !p.getAttribute('end')) {
        endTime = startTime + parseTimeToSeconds(p.getAttribute('dur'));
      }
      cues.push({
        start: startTime,
        end: endTime || startTime + 5,
        text: decodeEntities(text),
      });
    }
  }

  if (cues.length === 0) {
    const vttCues = parseWebVTTLike(doc.body?.textContent || '');
    cues.push(...vttCues);
  }

  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) {
      cues[i].end = cues[i + 1].start - 0.001;
    }
  }

  return cues;
}

function parseWebVTTLike(text) {
  const cues = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === 'WEBVTT') i = 1;

  while (i < lines.length) {
    while (i < lines.length && (lines[i].trim() === '' || /^\d+$/.test(lines[i].trim()))) {
      i++;
    }
    if (i >= lines.length) break;
    const timeMatch = lines[i]?.match(/^([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (timeMatch) {
      const start = parseTimeToSeconds(timeMatch[1]);
      const end = parseTimeToSeconds(timeMatch[2]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join(' ');
      if (text) {
        cues.push({ start, end, text: decodeEntities(stripTags(text)) });
      }
    } else {
      i++;
    }
  }
  return cues;
}

function parseSRT(text) {
  return parseWebVTTLike(text);
}

// ── Video Integration ────────────────────────────────────────────────────

function getVideoElement() {
  const player2 = document.getElementById('dv-web-player-2');
  if (player2) {
    const video = player2.querySelector('video');
    if (video && video.src) return video;
  }
  const player = document.getElementById('dv-web-player');
  if (player) {
    const video = player.querySelector('video');
    if (video && video.src) return video;
  }
  return document.querySelector('#dv-web-player-2 video, #dv-web-player video, video');
}

function findActiveCueIndex(timeSec) {
  const { cues } = STATE;
  for (let i = 0; i < cues.length; i++) {
    if (timeSec >= cues[i].start && timeSec < cues[i].end) {
      return i;
    }
  }
  return -1;
}

function seekTo(timeSec) {
  const video = getVideoElement();
  if (video) {
    video.currentTime = timeSec;
    renderTranscript();
  }
}

// ── React Rendering ───────────────────────────────────────────────────────

function renderTranscript() {
  if (!panelContent) return;
  mountTranscript(
    panelContent,
    STATE.cues,
    STATE.activeCueIdx,
    detectedL2Code,
    seekTo,
  );
}

// ── Subtitle Fetching ────────────────────────────────────────────────────

async function fetchAndParseSubtitles(url) {
  STATE.loading = true;
  updateStatus('Loading subtitles...');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    let cues;
    const trimmed = text.trim();

    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
      cues = parseTTML(text);
    } else if (trimmed.startsWith('WEBVTT')) {
      cues = parseWebVTTLike(text);
    } else if (/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(trimmed)) {
      cues = parseSRT(text);
    } else {
      cues = parseTTML(text);
    }

    STATE.cues = cues;
    STATE.subtitleUrl = url;

    // Try to detect language from subtitle content
    tryDetectL2FromCues(cues);

    if (cues.length === 0) {
      updateStatus('No cues found in subtitle file');
      mountTranscript(panelContent, [], -1, detectedL2Code, seekTo);
    } else {
      updateStatus(`${cues.length} subtitle entries loaded`);
      STATE.activeCueIdx = -1;
      renderTranscript();
      if (!STATE.panelVisible) {
        setPanelVisible(true);
      }
    }
  } catch (err) {
    console.error('[PrimeVideoSubs] Failed to fetch/parse subtitles:', err);
    updateStatus('Failed to load subtitles');
  } finally {
    STATE.loading = false;
  }
}

/** Heuristic: detect language from the subtitle text content */
function tryDetectL2FromCues(cues) {
  if (cues.length === 0) return;
  const sample = cues.slice(0, 5).map(c => c.text).join(' ');
  // Japanese: contains hiragana or katakana
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) { detectedL2Code = 'ja'; return; }
  // Chinese: contains CJK characters
  if (/[\u4e00-\u9fff]/.test(sample)) { detectedL2Code = 'zh'; return; }
  // Korean: contains Hangul
  if (/[\uac00-\ud7af]/.test(sample)) { detectedL2Code = 'ko'; return; }
  // Thai
  if (/[\u0e00-\u0e7f]/.test(sample)) { detectedL2Code = 'th'; return; }
  // Arabic
  if (/[\u0600-\u06ff]/.test(sample)) { detectedL2Code = 'ar'; return; }
  // Default: keep the page-detected language
}

// ── Panel UI ─────────────────────────────────────────────────────────────

function createPanelUI() {
  if (panelRoot) return;

  toggleBtn = document.createElement('button');
  toggleBtn.id = 'lpv-toggle-btn';
  toggleBtn.innerHTML = '📝';
  toggleBtn.title = 'Show transcript (Alt+T)';
  toggleBtn.setAttribute('aria-label', 'Show transcript panel');
  toggleBtn.addEventListener('click', togglePanel);

  panelRoot = document.createElement('div');
  panelRoot.id = 'lpv-transcript-panel';
  panelRoot.classList.add('lpv-collapsed');

  const header = document.createElement('div');
  header.id = 'lpv-panel-header';

  const title = document.createElement('span');
  title.id = 'lpv-panel-title';
  title.textContent = 'Transcript';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'lpv-close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close panel';
  closeBtn.addEventListener('click', () => setPanelVisible(false));

  header.appendChild(title);
  header.appendChild(closeBtn);

  statusEl = document.createElement('div');
  statusEl.id = 'lpv-status';
  statusEl.textContent = 'Waiting for subtitles...';

  panelContent = document.createElement('div');
  panelContent.id = 'lpv-panel-content';

  panelRoot.appendChild(header);
  panelRoot.appendChild(statusEl);
  panelRoot.appendChild(panelContent);

  document.body.appendChild(panelRoot);
  document.body.appendChild(toggleBtn);

  STATE.panelReady = true;

  // Initial empty render
  mountTranscript(panelContent, [], -1, detectedL2Code, seekTo);
}

function setPanelVisible(visible) {
  if (!panelRoot) return;
  STATE.panelVisible = visible;

  if (visible) {
    panelRoot.classList.remove('lpv-collapsed');
    toggleBtn.classList.add('lpv-hidden');
    document.body.classList.add('lpv-panel-open');
  } else {
    panelRoot.classList.add('lpv-collapsed');
    toggleBtn.classList.remove('lpv-hidden');
    document.body.classList.remove('lpv-panel-open');
  }
}

function togglePanel() {
  setPanelVisible(!STATE.panelVisible);
}

function updateStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

// ── Time Tracking ────────────────────────────────────────────────────────

let timeUpdateRaf = null;

function updateActiveCue(timeSec) {
  const newIdx = findActiveCueIndex(timeSec);
  if (newIdx === STATE.activeCueIdx) return;
  STATE.activeCueIdx = newIdx;
  renderTranscript();
}

function onTimeUpdate() {
  if (timeUpdateRaf) return;
  timeUpdateRaf = requestAnimationFrame(() => {
    timeUpdateRaf = null;
    const video = getVideoElement();
    if (video && STATE.cues.length > 0) {
      updateActiveCue(video.currentTime);
    }
  });
}

function attachTimeTracking() {
  const video = getVideoElement();
  if (video) {
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', () => {
      if (STATE.cues.length > 0) {
        updateActiveCue(video.currentTime);
      }
    });
  }
}

// ── Player Detection ─────────────────────────────────────────────────────

function waitForPlayer() {
  return new Promise((resolve) => {
    const check = () => {
      const player = document.getElementById('dv-web-player-2') || document.getElementById('dv-web-player');
      if (player) {
        resolve(player);
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

// ── Message Handling ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'subtitleDetected') {
    const { url, fileName } = message;
    console.log('[PrimeVideoSubs] Subtitle detected:', fileName, url);
    if (!STATE.subtitleUrl || STATE.subtitleUrl !== url) {
      fetchAndParseSubtitles(url);
    }
  }

  if (message.action === 'loadSubtitles') {
    const { url } = message;
    fetchAndParseSubtitles(url);
  }

  sendResponse({ received: true });
});

// ── Keyboard Shortcuts ───────────────────────────────────────────────────

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
      e.preventDefault();
      togglePanel();
      return;
    }

    if (e.altKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      togglePanel();
      return;
    }

    if (!STATE.panelVisible) return;

    if (e.key === 'ArrowDown' && STATE.cues.length > 0) {
      e.preventDefault();
      const nextIdx = Math.min(STATE.activeCueIdx + 1, STATE.cues.length - 1);
      seekTo(STATE.cues[nextIdx].start);
    }
    if (e.key === 'ArrowUp' && STATE.cues.length > 0) {
      e.preventDefault();
      const prevIdx = Math.max(STATE.activeCueIdx - 1, 0);
      seekTo(STATE.cues[prevIdx].start);
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────

async function init() {
  console.log('[PrimeVideoSubs] Content script loaded (React edition)');

  detectL2Code();

  const playerEl = await waitForPlayer();
  console.log('[PrimeVideoSubs] Player found');

  createPanelUI();
  attachTimeTracking();
  setupKeyboard();

  const playerObserver = new MutationObserver(() => {
    const video = getVideoElement();
    if (video && !video._lpvTimeTracking) {
      video._lpvTimeTracking = true;
      attachTimeTracking();
    }
  });

  const playerContainer = document.getElementById('dv-web-player-2') || document.getElementById('dv-web-player');
  if (playerContainer) {
    playerObserver.observe(playerContainer, { childList: true, subtree: true });
  }

  chrome.runtime.sendMessage({ action: 'contentScriptReady' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
