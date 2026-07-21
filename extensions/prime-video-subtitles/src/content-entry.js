/**
 * Language Player — Content Script (React edition)
 *
 * Injects a collapsible transcript panel alongside the video player.
 * Supports Prime Video (TTML/XML via webRequest) and YouTube (timedtext via page data).
 * Parses subtitles, displays time-synced transcript entries with tokenized,
 * clickable text, dictionary lookup, word saving, and AI explanations.
 */

import { mountTranscript, unmountTranscript } from './transcript-app';
import { SUPPORTED_L2S } from '@langplayer/shared';

// ── Site detection ───────────────────────────────────────────────────────
const isYouTube = /youtube\.com/.test(location.hostname);
const isPrimeVideo = /primevideo\.com|amazon\.(com|co\.uk|de|co\.jp)/.test(location.hostname);
const isNetflix = /netflix\.com/.test(location.hostname);
const isDisneyPlus = /disneyplus\.com/.test(location.hostname);
const isHulu = /hulu\.com/.test(location.hostname);
const isHBOMax = /max\.com|hbonow\.com|hbomax\.com/.test(location.hostname);

/** Popular languages shown first in the L2 dropdown */
const POPULAR_L2S = [
  'en', 'zh', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
];

// ── State ────────────────────────────────────────────────────────────────
const STATE = {
  cues: [],           // parsed subtitle cues: { start, end, text }
  activeCueIdx: -1,   // index of currently active cue
  panelVisible: false,
  panelReady: false,
  subtitleUrl: null,
  loading: false,
};

/** Generation counter — incremented before each subtitle fetch.
 *  Prevents race conditions where a slow-loading subtitle file
 *  overwrites a newer one that loaded faster. */
let fetchGen = 0;

// ── DOM refs ─────────────────────────────────────────────────────────────
let panelRoot = null;
let panelContent = null;
let statusEl = null;
let l2SelectEl = null;

// ── L2 language detection ────────────────────────────────────────────────
let detectedL2Code = 'en';

/** The user's native / UI language. Defaults to 'en'. */
const L1_CODE = 'en';

/** YouTube caption tracks cache (for L2 switcher) */
let ytCaptionTracks = [];
let ytPlayerResponse = null;

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
  if (isYouTube) {
    const yt = document.querySelector('#movie_player video.html5-main-video, #movie_player video, video.html5-main-video');
    if (yt && yt.src) return yt;
  }
  if (isPrimeVideo) {
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
    return document.querySelector('#dv-web-player-2 video, #dv-web-player video');
  }
  if (isNetflix) {
    // Netflix uses a standard <video> element
    const video = document.querySelector('video');
    if (video && video.src) return video;
  }
  if (isDisneyPlus) {
    // Disney+ has multiple <video> elements — one hidden, one playing.
    // The playing video is inside <disney-web-player> Shadow DOM.
    // Prefer visible (non-hidden) videos by checking offsetParent.
    let video = document.querySelector('#hivePlayer1, video.hive-video, video[src]:not([style*="display: none"])');
    if (video && video.src && video.offsetParent !== null) return video;
    // Fallback: any video[src] even if hidden
    video = document.querySelector('video[src]');
    if (video && video.src) return video;
    // Fallback: penetrate Shadow DOM
    const dwp = document.querySelector('disney-web-player');
    if (dwp?.shadowRoot) {
      const sv = dwp.shadowRoot.querySelector('#hivePlayer1, video.hive-video, video[src]');
      if (sv && sv.src) return sv;
    }
  }
  return document.querySelector('video');
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

/** Get the current playback time in seconds, using platform-specific APIs */
function getCurrentTime() {
  if (isDisneyPlus) {
    // Disney+ internal player API (used by Trancy) — immune to Shadow DOM issues
    try {
      const dwp = document.querySelector('disney-web-player');
      const ms = dwp?.mediaPlayer?.timeline?.info?.playheadPositionMs;
      if (typeof ms === 'number') return ms / 1000;
    } catch {}
  }
  const video = getVideoElement();
  return video ? video.currentTime : 0;
}

/** Get the video duration in seconds */
function getDuration() {
  if (isDisneyPlus) {
    try {
      const dwp = document.querySelector('disney-web-player');
      const ms = dwp?.mediaPlayer?.timeline?.info?.seekableDurationMs;
      if (typeof ms === 'number') return ms / 1000;
    } catch {}
  }
  const video = getVideoElement();
  return video ? video.duration : 0;
}

function seekTo(timeSec) {
  if (isNetflix) {
    // Netflix: must use player API (M7375 DRM error on direct currentTime)
    chrome.runtime.sendMessage({ action: 'netflixSeek', timeSec })
      .then((res) => {
        console.log('[LanguagePlayer] Netflix seek result:', res?.method || res?.error);
      })
      .catch(() => {});
  } else if (isDisneyPlus) {
    // Disney+: use internal mediaPlayer API (more reliable than video element)
    try {
      const dwp = document.querySelector('disney-web-player');
      if (dwp?.mediaPlayer?.seek) {
        dwp.mediaPlayer.seek(timeSec * 1000);
      }
    } catch {}
    // Fallback: also try direct video currentTime
    const video = getVideoElement();
    if (video) video.currentTime = timeSec;
  } else {
    const video = getVideoElement();
    if (video) {
      video.currentTime = timeSec;
    }
  }
  renderTranscript();
}

// ── React Rendering ───────────────────────────────────────────────────────

function renderTranscript(loadingL2) {
  if (!panelContent) return;
  mountTranscript(
    panelContent,
    STATE.cues,
    STATE.activeCueIdx,
    detectedL2Code,
    L1_CODE,
    seekTo,
    loadingL2,
  );
}

// ── Subtitle Fetching ────────────────────────────────────────────────────

async function fetchAndParseSubtitles(url) {
  // Block duplicate URLs and set URL BEFORE async fetch to prevent
  // concurrent fetches of different URLs from racing each other.
  if (STATE.subtitleUrl === url) return;
  STATE.subtitleUrl = url;
  STATE.loading = true;
  // Clear old cues and show spinner while loading new ones
  STATE.cues = [];
  renderTranscript(detectedL2Code);
  updateStatus(`Loading ${detectedL2Code} subtitles…`);

  const gen = ++fetchGen;

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

    // Only apply if no newer fetch has started
    if (fetchGen !== gen) return;

    STATE.cues = cues;

    // Try to detect language from subtitle content
    tryDetectL2FromCues(cues);

    if (cues.length === 0) {
      mountTranscript(panelContent, [], -1, detectedL2Code, L1_CODE, seekTo);
    } else {
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

// ── YouTube Subtitle Integration ─────────────────────────────────────────

/** Get a readable language name for display in the dropdown */
function languageName(code) {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    if (name && name !== code) return name;
  } catch {}
  return code.toUpperCase();
}

/** Build the sorted L2 list: popular first, then rest alphabetically by name */
function getSortedL2List() {
  const popularSet = new Set(POPULAR_L2S);
  const popular = POPULAR_L2S.filter(c => SUPPORTED_L2S.includes(c));
  const rest = SUPPORTED_L2S.filter(c => !popularSet.has(c));
  // Sort rest by display name
  rest.sort((a, b) => languageName(a).localeCompare(languageName(b)));
  return { popular, rest };
}

/** Extract video ID from YouTube URL */
function getYTVideoId() {
  const params = new URLSearchParams(location.search);
  return params.get('v') || '';
}

/** Extract a balanced JSON object from text, starting at '{' at startIdx.
 *  Handles nested braces, strings, and escape sequences. */
function extractBalancedJSON(text, startIdx) {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.substring(startIdx, i + 1);
    }
  }
  return null;
}

/** Read ytInitialPlayerResponse from the page using multiple strategies */
function getYTPlayerResponse() {
  // Strategy 1: window global (some YouTube versions)
  if (window.ytInitialPlayerResponse) {
    return window.ytInitialPlayerResponse;
  }

  // Strategy 2: getInitialData() mechanism (modern YouTube)
  if (typeof window.getInitialData === 'function') {
    try {
      const id = window.getInitialData();
      if (id?.playerResponse) return id.playerResponse;
    } catch {}
  }

  // Strategy 3: Search script tags with brace-counting JSON extraction
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent || '';

    // Try var/let/const declaration
    let idx = text.search(/(?:var|let|const)\s+ytInitialPlayerResponse\s*=\s*\{/);
    if (idx < 0) {
      // Try assignment without var (e.g. a.ytInitialPlayerResponse = {...})
      idx = text.search(/ytInitialPlayerResponse\s*=\s*\{/);
    }
    if (idx >= 0) {
      const start = text.indexOf('{', idx);
      if (start >= 0) {
        const json = extractBalancedJSON(text, start);
        if (json) {
          try { return JSON.parse(json); } catch {}
        }
      }
    }

    // Fallback: ytplayer.config
    const cfgIdx = text.search(/ytplayer\.config\s*=\s*\{/);
    if (cfgIdx >= 0) {
      const start = text.indexOf('{', cfgIdx);
      if (start >= 0) {
        const json = extractBalancedJSON(text, start);
        if (json) {
          try {
            const cfg = JSON.parse(json);
            if (cfg?.args?.player_response) {
              return JSON.parse(cfg.args.player_response);
            }
          } catch {}
        }
      }
    }
  }

  return null;
}

/** Get caption tracks from player response */
function getYTCaptionTracks(pr) {
  try {
    return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  } catch {
    return [];
  }
}

// ── InnerTube API (replicates youtube_transcript_api client-side) ───────────

/** Extract INNERTUBE_API_KEY from the page HTML */
function extractInnertubeApiKey() {
  const html = document.documentElement.innerHTML;
  const match = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([a-zA-Z0-9_-]+)"/);
  if (match) return match[1];

  // Fallback: search script tags individually
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const m = (script.textContent || '').match(/"INNERTUBE_API_KEY"\s*:\s*"([a-zA-Z0-9_-]+)"/);
    if (m) return m[1];
  }
  return null;
}

/** POST to YouTube's InnerTube API and extract caption tracks */
async function fetchInnerTubeTracks(videoId) {
  const apiKey = extractInnertubeApiKey();
  if (!apiKey) {
    console.log('[LanguagePlayer] No INNERTUBE_API_KEY found');
    return [];
  }

  console.log('[LanguagePlayer] InnerTube API key:', apiKey.substring(0, 8) + '...');

  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
          },
        },
        videoId,
      }),
    });

    if (!res.ok) {
      console.log('[LanguagePlayer] InnerTube HTTP', res.status);
      return [];
    }

    const data = await res.json();
    const captions = data?.captions?.playerCaptionsTracklistRenderer;
    if (!captions?.captionTracks) {
      console.log('[LanguagePlayer] InnerTube: no caption tracks');
      return [];
    }

    const tracks = captions.captionTracks.map(t => ({
      baseUrl: (t.baseUrl || '').replace(/&fmt=srv3/, '').replace(/&fmt=vtt/, ''),
      languageCode: t.languageCode,
      kind: t.kind || '',
      name: t.name?.runs?.[0]?.text || t.name?.simpleText || '',
    }));

    console.log('[LanguagePlayer] InnerTube found', tracks.length, 'tracks:',
      tracks.map(t => `${t.languageCode}${t.kind === 'asr' ? ' (auto)' : ''}`).join(', '));

    return tracks;
  } catch (err) {
    console.error('[LanguagePlayer] InnerTube fetch failed:', err?.message);
    return [];
  }
}

/** Parse YouTube timedtext XML into cues */
function parseYTTimedText(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const cues = [];

  const textEls = doc.querySelectorAll('text');
  for (const el of textEls) {
    const start = parseFloat(el.getAttribute('start') || '0');
    const dur = parseFloat(el.getAttribute('dur') || '0');
    const text = stripTags(el.innerHTML || el.textContent || '');
    if (text && dur > 0) {
      cues.push({
        start,
        end: start + dur,
        text: decodeEntities(text),
      });
    }
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** Cache tab ID from background (set once on init) */
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

/** Fetch a URL via background worker (which calls executeScript in MAIN world).
 *  Content scripts can't call chrome.scripting.executeScript directly. */
function mainWorldFetch(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'mainWorldFetch', url }, (res) => {
      resolve(res?.text || '');
    });
  });
}

/** Fetch YouTube subtitles from a track and render */
async function fetchYTTrack(track) {
  try {
    updateStatus('Loading subtitles...');

    // Ensure URL is absolute
    let url = track.baseUrl;
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) url = 'https://www.youtube.com' + url;

    console.log('[LanguagePlayer] MAIN fetching:', url.substring(0, 100));

    let text = await mainWorldFetch(url);
    console.log('[LanguagePlayer] MAIN response:', text.length, 'chars');
    if (text.length < 1000) console.log('[LanguagePlayer] Response preview:', text.substring(0, 500));

    let cues;

    if (!text || text.length === 0) {
      // Fall back to unsigned JSON3 URL
      const videoId = getYTVideoId();
      const lang = track.languageCode || 'en';
      text = await mainWorldFetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`);
      console.log('[LanguagePlayer] Fallback MAIN response:', text.length, 'chars');
      if (!text || text.length === 0) {
        console.log('[LanguagePlayer] MAIN also returned empty');
        return;
      }
      cues = parseYTJSON3(text);
    } else if (text.trim().startsWith('<')) {
      cues = parseYTTimedText(text);
    } else {
      try { cues = parseYTJSON3(text); } catch { cues = parseYTTimedText(text); }
    }

    console.log('[LanguagePlayer] Parsed', cues.length, 'cues');

    STATE.cues = cues;
    STATE.subtitleUrl = track.baseUrl;

    if (track.languageCode) {
      detectedL2Code = track.languageCode.split('-')[0];
      if (l2SelectEl) l2SelectEl.value = detectedL2Code;
    }
    tryDetectL2FromCues(cues);

    if (cues.length > 0) {
      STATE.activeCueIdx = -1;
      renderTranscript();
      if (!STATE.panelVisible) setPanelVisible(true);
    }
    setBadge(true);
    updateStatus(`${cues.length} subtitle entries loaded`);
  } catch (err) {
    console.error('[LanguagePlayer] Failed to fetch YouTube subtitles:', err);
    updateStatus('Failed to load subtitles');
  }
}

/** Parse YouTube JSON3 timedtext format */
function parseYTJSON3(jsonText) {
  const data = JSON.parse(jsonText);
  const cues = [];
  const events = data?.events || [];

  for (const ev of events) {
    const start = (ev.tStartMs || 0) / 1000;
    const dur = (ev.dDurationMs || 0) / 1000;
    const segs = ev.segs || [];
    const text = segs.map(s => s.utf8 || '').join('').trim();
    if (text && dur > 0) {
      cues.push({ start, end: start + dur, text: decodeEntities(stripTags(text)) });
    }
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** Load YouTube subtitles — discover tracks and pick the best one */
async function loadYouTubeSubtitles() {
  const videoId = getYTVideoId();
  if (!videoId) {
    console.log('[LanguagePlayer] No YouTube video ID found in URL');
    return;
  }

  console.log('[LanguagePlayer] Looking for caption data...');

  // Try InnerTube API first (mimics ANDROID client)
  let tracks = await fetchInnerTubeTracks(videoId);

  if (tracks.length === 0) {
    // Fall back to ytInitialPlayerResponse from the page
    let pr = getYTPlayerResponse();
    let attempts = 0;
    while (!pr && attempts < 30) {
      await new Promise(r => setTimeout(r, 500));
      pr = getYTPlayerResponse();
      attempts++;
    }
    if (pr) {
      ytPlayerResponse = pr;
      tracks = getYTCaptionTracks(pr);
    }
  }

  ytCaptionTracks = tracks;

  if (tracks.length === 0) {
    console.log('[LanguagePlayer] No caption tracks found');
    return;
  }

  populateL2Selector();

  // Pick best track: prefer manual matching detected L2
  let best = null;
  const l2Matches = tracks.filter(t => t.languageCode === detectedL2Code || t.languageCode?.startsWith(detectedL2Code));
  if (l2Matches.length > 0) {
    best = l2Matches.find(t => t.kind !== 'asr') || l2Matches[0];
  }
  if (!best) {
    best = tracks.find(t => t.kind !== 'asr') || tracks[0];
  }

  if (best) {
    console.log('[LanguagePlayer] Loading track:', best.languageCode, best.kind === 'asr' ? '(auto)' : '');
    await fetchYTTrack(best);
  }
}

/** Populate the L2 language dropdown with all supported languages */
function populateL2Selector() {
  if (!l2SelectEl) return;
  l2SelectEl.innerHTML = '';

  const { popular, rest } = getSortedL2List();

  // Popular group
  const popularGroup = document.createElement('optgroup');
  popularGroup.label = 'Popular';
  for (const code of popular) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = languageName(code);
    if (code === detectedL2Code) opt.selected = true;
    popularGroup.appendChild(opt);
  }
  l2SelectEl.appendChild(popularGroup);

  // Rest group
  const restGroup = document.createElement('optgroup');
  restGroup.label = 'All Languages';
  for (const code of rest) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = languageName(code);
    if (code === detectedL2Code) opt.selected = true;
    restGroup.appendChild(opt);
  }
  l2SelectEl.appendChild(restGroup);

  l2SelectEl.disabled = false;
}

/** Load the user's saved L2 language preference from storage */
async function loadSavedL2Preference() {
  try {
    const result = await chrome.storage.local.get(['l2Language']);
    if (result.l2Language && SUPPORTED_L2S.includes(result.l2Language)) {
      detectedL2Code = result.l2Language;
      console.log('[LanguagePlayer] Loaded saved L2 preference:', detectedL2Code);
    }
  } catch {}
}

/** Handle L2 language change from the dropdown */
async function onL2Change(newCode) {
  if (newCode === detectedL2Code) return;
  detectedL2Code = newCode;

  // Persist user preference
  try {
    chrome.storage.local.set({ l2Language: newCode });
  } catch {}

  // For Netflix: try to load a different subtitle track from cache
  if (isNetflix && Object.keys(cachedNetflixTracks).length > 0) {
    const langKeys = Object.keys(cachedNetflixTracks);
    const bestKey = langKeys.find(k => cachedNetflixTracks[k].languageCode === newCode)
      || langKeys.find(k => cachedNetflixTracks[k].languageCode?.startsWith?.(newCode?.split('-')[0]))
      || null;
    if (bestKey) {
      // Clear old cues immediately, spinner shown by loadNetflixTrackForLanguage
      STATE.cues = [];
      renderTranscript(newCode);
      await loadNetflixTrackForLanguage(cachedNetflixTracks[bestKey].languageCode);
      return;
    }
  }

  // For YouTube: try to find a matching caption track
  if (isYouTube && ytCaptionTracks.length > 0) {
    const match = ytCaptionTracks.find(t =>
      t.languageCode === newCode ||
      t.languageCode?.split('-')[0] === newCode.split('-')[0]
    );
    if (match) {
      await fetchYTTrack(match);
      return;
    }
    const best = ytCaptionTracks.find(t => t.kind !== 'asr') || ytCaptionTracks[0];
    if (best) {
      await fetchYTTrack(best);
      detectedL2Code = newCode;
      renderTranscript();
      return;
    }
  }

  // Other platforms: just re-render existing cues with new tokenization
  renderTranscript();
}

/** Listen for YouTube SPA navigation */
let ytNavObserver = null;
function setupYouTubeNavigationObserver() {
  if (!isYouTube) return;

  let lastVideoId = getYTVideoId();

  ytNavObserver = new MutationObserver(() => {
    const currentId = getYTVideoId();
    if (currentId && currentId !== lastVideoId) {
      lastVideoId = currentId;
      ytCaptionTracks = [];
      ytPlayerResponse = null;
      setTimeout(() => loadYouTubeSubtitles(), 1500);
    }
  });

  ytNavObserver.observe(document.body, { childList: true, subtree: true });
}

/** Notify background script to set/unset badge */
function setBadge(found) {
  try {
    chrome.runtime.sendMessage({ action: 'setBadge', found });
  } catch {}
}

// ── Panel UI ─────────────────────────────────────────────────────────────

function createPanelUI() {
  if (panelRoot) return;

  panelRoot = document.createElement('div');
  panelRoot.id = 'lpv-transcript-panel';
  panelRoot.classList.add('lpv-collapsed');

  const header = document.createElement('div');
  header.id = 'lpv-panel-header';

  const title = document.createElement('span');
  title.id = 'lpv-panel-title';

  const logoImg = document.createElement('img');
  logoImg.id = 'lpv-panel-logo';
  logoImg.src = chrome.runtime.getURL('src/language-player-logo-64.png');
  logoImg.alt = '';
  logoImg.width = 24;
  logoImg.height = 24;

  const titleText = document.createTextNode('Language Player');

  title.appendChild(logoImg);
  title.appendChild(titleText);

  // L2 language selector
  l2SelectEl = document.createElement('select');
  l2SelectEl.id = 'lpv-l2-select';
  l2SelectEl.title = 'Learning language';
  l2SelectEl.addEventListener('change', () => {
    onL2Change(l2SelectEl.value);
  });

  const headerRight = document.createElement('div');
  headerRight.id = 'lpv-header-right';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'lpv-close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close panel';
  closeBtn.addEventListener('click', () => setPanelVisible(false));

  headerRight.appendChild(l2SelectEl);
  headerRight.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(headerRight);

  statusEl = document.createElement('div');
  statusEl.id = 'lpv-status';
  statusEl.textContent = 'Waiting for subtitles...';

  panelContent = document.createElement('div');
  panelContent.id = 'lpv-panel-content';

  panelRoot.appendChild(header);
  panelRoot.appendChild(panelContent);

  document.body.appendChild(panelRoot);

  STATE.panelReady = true;

  // Initial empty render
  mountTranscript(panelContent, [], -1, detectedL2Code, L1_CODE, seekTo);
}

function setPanelVisible(visible) {
  if (!panelRoot) return;
  STATE.panelVisible = visible;

  if (visible) {
    panelRoot.classList.remove('lpv-collapsed');
    document.body.classList.add('lpv-panel-open');
  } else {
    panelRoot.classList.add('lpv-collapsed');
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
    if (STATE.cues.length > 0) {
      updateActiveCue(getCurrentTime());
    }
  });
}

function attachTimeTracking() {
  const video = getVideoElement();
  if (video && !video._lpvTimeTracking) {
    video._lpvTimeTracking = true;
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', () => {
      if (STATE.cues.length > 0) {
        updateActiveCue(getCurrentTime());
      }
    });
  }
}

/** Netflix subtitle tracks cache (all available tracks from manifest) */
let cachedNetflixTracks = {};

// ── Netflix Subtitle Integration ─────────────────────────────────────────

/**
 * Inject the JSON.parse monkeypatch into Netflix's MAIN world via a
 * synchronous <script src> tag. This is the approach used by NflxMultiSubs
 * (229★, v3.0.3) — it works because:
 *
 * 1. The script is loaded from chrome-extension:// URL (not inline), so
 *    Netflix's CSP allows it.
 * 2. <script> tag injection at document_start blocks HTML parsing until
 *    the script executes — guaranteeing JSON.parse is hooked before any
 *    Netflix JavaScript runs.
 * 3. No background worker round-trip latency.
 *
 * The MAIN world script (dist/netflix-main-world.js) hooks JSON.parse,
 * extracts subtitle track metadata, and posts it back via window.postMessage.
 */
function setupNetflixInterceptor() {
  // Listen for messages from the MAIN world script (set up BEFORE injection
  // so we don't miss the message, though sync injection makes this safe)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'lpv-netflix') return;

    if (event.data.type === 'netflixTracks') {
      console.log('[LanguagePlayer] Received Netflix tracks from MAIN world:', event.data.tracks.length);
      handleNetflixSubs(event.data.tracks);
    }
  });

  // Inject the MAIN world script synchronously via <script src> tag.
  // At document_start, document.head may not exist yet.
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dist/netflix-main-world.js');
  (document.head || document.documentElement).appendChild(script);
  console.log('[LanguagePlayer] Netflix interceptor injected via <script src>');
}

/**
 * Probe the MAIN world to detect which subtitle track Netflix is currently
 * showing. Netflix populates <video>.textTracks even though they render
 * subtitles in their own overlay — the active track has mode='showing'.
 * Returns the language code (e.g. 'ja') or null.
 */
async function detectNetflixActiveSubtitle() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'netflixProbeActiveTrack',
    }, (res) => {
      resolve(res?.language || null);
    });
  });
}

/**
 * Start watching for Netflix subtitle changes. Netflix recreates text tracks
 * when the user changes subtitles, so we poll video.textTracks.
 */
function observeNetflixSubtitleChanges() {
  let lastActiveLang = null;

  setInterval(async () => {
    const activeLang = await detectNetflixActiveSubtitle();
    if (activeLang && activeLang !== lastActiveLang && cachedNetflixTracks[activeLang]) {
      lastActiveLang = activeLang;
      console.log('[LanguagePlayer] Netflix subtitle changed to:', activeLang);
      await loadNetflixTrackForLanguage(activeLang);
    }
  }, 3000);
}

/** Load the Netflix subtitle track matching a language code from cache */
async function loadNetflixTrackForLanguage(langCode) {
  if (!langCode || Object.keys(cachedNetflixTracks).length === 0) return;

  const langKeys = Object.keys(cachedNetflixTracks);
  // Find cached track: exact languageCode match > prefix match
  const bestKey = langKeys.find(k => cachedNetflixTracks[k].languageCode === langCode)
    || langKeys.find(k => {
      const cl = cachedNetflixTracks[k].languageCode;
      return cl && langCode && (cl.startsWith(langCode) || langCode.startsWith(cl));
    })
    || null;

  if (!bestKey) {
    console.log('[LanguagePlayer] No cached Netflix track for language:', langCode);
    return;
  }

  const track = cachedNetflixTracks[bestKey];
  const gen = ++fetchGen;
  console.log('[LanguagePlayer] Loading Netflix track:', bestKey, track.format);

  // Clear old cues and show spinner
  STATE.cues = [];
  renderTranscript(bestKey);
  updateStatus(`Loading ${bestKey} subtitles…`);

  try {
    const response = await fetch(track.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();

    // Only apply if no newer load has started
    if (fetchGen !== gen) return;

    let cues;
    if (track.format.includes('webvtt')) {
      cues = parseWebVTTLike(text);
    } else {
      cues = parseTTML(text);
    }

    console.log('[LanguagePlayer] Netflix parsed', cues.length, 'cues');

    STATE.cues = cues;
    detectedL2Code = track.languageCode || detectedL2Code;
    tryDetectL2FromCues(cues);

    if (l2SelectEl && detectedL2Code) {
      l2SelectEl.value = detectedL2Code;
    }

    if (cues.length > 0) {
      STATE.activeCueIdx = -1;
      renderTranscript();
      if (!STATE.panelVisible) setPanelVisible(true);
    }
    setBadge(true);
    updateStatus(`${cues.length} subtitle entries loaded`);
  } catch (err) {
    console.error('[LanguagePlayer] Failed to fetch Netflix subtitles:', err);
    updateStatus('Failed to load subtitles');
  }
}

/** Process Netflix subtitle tracks and fetch the actual subtitle file */
async function handleNetflixSubs(tracks) {
  const subs = {};

  for (const track of tracks) {
    if (track.isNoneTrack) continue;
    if (!track.url) continue;

    const langKey = track.language + (track.trackType === 'closedcaptions' ? '[cc]' : '');
    subs[langKey] = {
      url: track.url,
      format: track.format,
      languageCode: track.languageCode || track.language,
    };
  }

  // Cache all tracks for later language switching
  cachedNetflixTracks = subs;

  console.log('[LanguagePlayer] Netflix subtitle tracks:',
    Object.keys(subs).map(k => `${k} (${subs[k].languageCode})`).join(', '));

  // Detect which subtitle Netflix is currently showing via video.textTracks
  const activeLang = await detectNetflixActiveSubtitle();
  console.log('[LanguagePlayer] Detected Netflix active subtitle:', activeLang || '(none found)');

  if (activeLang) {
    await loadNetflixTrackForLanguage(activeLang);
  } else {
    // Fallback: save preference then first available
    const userL2 = l2SelectEl?.value || detectedL2Code;
    const langKeys = Object.keys(subs);
    const bestKey = langKeys.find(k => subs[k].languageCode === userL2)
      || langKeys.find(k => subs[k].languageCode?.startsWith?.(userL2?.split('-')[0]))
      || langKeys[0];
    if (bestKey && subs[bestKey]) {
      await loadNetflixTrackForLanguage(subs[bestKey].languageCode);
    }
  }

  // Start watching for Netflix subtitle changes
  observeNetflixSubtitleChanges();
}

// ── Player Detection ─────────────────────────────────────────────────────

function waitForPlayer() {
  return new Promise((resolve) => {
    const check = () => {
      if (isYouTube) {
        const yt = document.getElementById('movie_player');
        if (yt) { resolve(yt); return; }
      }
      if (isPrimeVideo) {
        const player = document.getElementById('dv-web-player-2') || document.getElementById('dv-web-player');
        if (player) { resolve(player); return; }
      }
      if (isNetflix) {
        // Netflix: wait for any video element to appear
        const video = document.querySelector('video');
        if (video && video.duration > 0) { resolve(video.parentElement); return; }
      }
      if (isDisneyPlus) {
        // Disney+: check regular DOM and Shadow DOM
        let video = document.querySelector('video[src]');
        if (!video) {
          const dwp = document.querySelector('disney-web-player');
          if (dwp?.shadowRoot) video = dwp.shadowRoot.querySelector('video[src]');
        }
        if (video && video.duration > 0) { resolve(video.parentElement || video); return; }
      }
      // Generic: any large video on the page
      const video = document.querySelector('video');
      if (video && video.duration > 0) { resolve(video.parentElement); return; }
      requestAnimationFrame(check);
    };
    check();
  });
}

// ── Message Handling ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'subtitleDetected') {
    const { url, fileName } = message;
    console.log('[LanguagePlayer] Subtitle detected:', fileName, url);
    fetchAndParseSubtitles(url);
  }

  if (message.action === 'loadSubtitles') {
    const { url } = message;
    fetchAndParseSubtitles(url);
  }

  if (message.action === 'getTranscriptStatus') {
    sendResponse({
      cuesCount: STATE.cues.length,
      panelVisible: STATE.panelVisible,
      detectedL2Code,
    });
    return true;
  }

  if (message.action === 'showTranscript') {
    setPanelVisible(true);
    sendResponse({ success: true });
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
  console.log('[LanguagePlayer] Content script loaded');

  detectL2Code();

  // Load saved language preference for ALL platforms
  await loadSavedL2Preference();

  // Netflix: inject the JSON.parse monkeypatch IMMEDIATELY, before waiting
  // for the player. Netflix loads its playback manifest early in the page
  // lifecycle — if we wait for the player first, the manifest JSON has
  // already been parsed and our monkeypatch misses it.
  if (isNetflix) {
    setupNetflixInterceptor();
  }

  const playerEl = await waitForPlayer();
  console.log('[LanguagePlayer] Player found');

  createPanelUI();
  populateL2Selector();
  setupKeyboard();

  if (isYouTube) {
    // YouTube: extract subs from page data, re-attach time tracking periodically
    await loadYouTubeSubtitles();
    setupYouTubeNavigationObserver();
    setInterval(() => {
      attachTimeTracking();
    }, 2000);
  } else if (isNetflix) {
    // Netflix: interceptor already set up before waitForPlayer().
    // Cues may have already been loaded while we were waiting for the player.
    // If so, render them now that the panel exists.
    if (STATE.cues.length > 0) {
      console.log('[LanguagePlayer] Rendering pre-loaded cues:', STATE.cues.length);
      STATE.activeCueIdx = -1;
      renderTranscript();
      if (!STATE.panelVisible) setPanelVisible(true);
      setBadge(true);
      updateStatus(`${STATE.cues.length} subtitle entries loaded`);
    }
    attachTimeTracking();
    setInterval(() => {
      attachTimeTracking();
    }, 2000);
  } else if (isDisneyPlus || isHulu || isHBOMax) {
    // Disney+ / Hulu / HBO Max: subs via webRequest (same as Prime Video)
    attachTimeTracking();
    const playerObserver = new MutationObserver(() => {
      attachTimeTracking();
    });
    const container = document.querySelector('disney-web-player')
      || document.querySelector('.hulu-player')
      || document.getElementById('content-video-player')
      || document.querySelector('[data-testid="player-ux-video"]');
    if (container) {
      playerObserver.observe(container, { childList: true, subtree: true });
    }
  } else {
    // Prime Video: subs come via webRequest → message listener
    attachTimeTracking();
    const playerObserver = new MutationObserver(() => {
      attachTimeTracking();
    });
    const playerContainer = document.getElementById('dv-web-player-2') || document.getElementById('dv-web-player');
    if (playerContainer) {
      playerObserver.observe(playerContainer, { childList: true, subtree: true });
    }
  }

  chrome.runtime.sendMessage({ action: 'contentScriptReady' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
