/**
 * Language Player — Content Script (React edition)
 *
 * Injects a collapsible transcript panel alongside the video player.
 * Supports Prime Video, YouTube, Netflix, Disney+, Hulu, and Max.
 * Parses subtitles (TTML, WebVTT, SRT, YouTube timedtext/JSON3),
 * displays time-synced transcript entries with tokenized, clickable text,
 * dictionary lookup, word saving, and AI explanations.
 */

import { SUPPORTED_L1S, CONTENT_L2S, POPULAR_L2S } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import {
  parseTimeToSeconds, stripTags, decodeEntities,
  parseTTML, parseWebVTTLike, parseSRT,
  parseYTTimedText, parseYTJSON3, tryDetectL2FromCues,
} from './subtitle-parsers';
import { t, setLocale, getLocaleVersion, log, logwarn, logerr } from './i18n';
import langNames from '../dist/lang-names.json';

// ── Site detection ───────────────────────────────────────────────────────
const isYouTube = /youtube\.com/.test(location.hostname);
const isPrimeVideo = /primevideo\.com|amazon\.(com|co\.uk|de|co\.jp)/.test(location.hostname);
const isNetflix = /netflix\.com/.test(location.hostname);
const isDisneyPlus = /disneyplus\.com/.test(location.hostname);
const isHulu = /hulu\.com/.test(location.hostname);
const isHBOMax = /max\.com|hbonow\.com|hbomax\.com/.test(location.hostname);

/**
 * YouTube auto-generated (ASR) caption alignment.
 *
 * Auto-generated captions carry per-seg word timings in the json3 payload.
 * The raw event window can span recognition silence, so anchoring each line to
 * its first word's start and last word's end is more accurate than shifting
 * every cue by a constant. The previous constant `YT_ASR_LEAD_OFFSET_SEC`
 * (2.0s) lead shift was removed in favour of this literal word-based timing
 * (the starttime of each line is the starttime of the first word of the line).
 */
function applyASRWordTiming(cues) {
  if (!Array.isArray(cues)) return cues;
  const out = [];
  for (const cue of cues) {
    const words = cue.words || [];
    // ASR cues that carry word timing anchor start/end to the spoken span.
    // XML/timedtext ASR tracks have no per-word data — keep the cue as-is.
    if (words.length > 0) {
      out.push({ start: words[0].start, end: words[words.length - 1].end, text: cue.text });
    } else {
      out.push({ start: cue.start, end: cue.end, text: cue.text });
    }
  }
  out.sort((a, b) => a.start - b.start);
  // ASR cues overlap (rolling recognition windows): the previous line's `end`
  // can run past the next line's `start`. Clamp so findActiveCueIndex picks
  // exactly one line — otherwise clicking a line seeks to the previous line.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) {
      out[i].end = out[i + 1].start - 0.001;
    }
  }
  return out.filter((c) => c.end - c.start > 0.02);
}

/** Trace logging helper — labels each step with a unique phase tag so
 *  you can follow the full pipeline from subtitle fetch to rendered tokens.
 *  Usage: trace('TOKENS_LOADED', '120 texts enqueued') → "[LP Extension] [FETCH] ..."
 */
const TRACE_PHASES = {
  FETCH:    'FETCH',
  PARSE:    'PARSE',
  REACT:    'REACT',
  TOKENIZE: 'TOKENIZE',
  TRANSLATE:'TRANSLATE',
  RENDER:   'RENDER',
};
function trace(phase, msg) {
  log(`[${phase}] ${msg}`);
}

// ── State ────────────────────────────────────────────────────────────────
const STATE = {
  cues: [],           // parsed subtitle cues: { start, end, text }
  activeCueIdx: -1,   // index of currently active cue
  subtitleUrl: null,
  loading: false,
  subtitleStatus: 'idle', // idle | detecting | ready | empty | error
  subtitleError: null,
};

/** Generation counter — incremented before each subtitle fetch.
 *  Prevents race conditions where a slow-loading subtitle file
 *  overwrites a newer one that loaded faster. */
let fetchGen = 0;
let detectionGeneration = 0;
let detectionPromise = null;
let detectionTimer = null;

// ── Panel state ───────────────────────────────────────────────────────────
/** True while the native side panel is open on this tab (told by the
 *  background via the panelOpenState message). Gates ArrowUp/Down seeking in
 *  setupKeyboard(). The panel UI itself lives in the side panel page, not the
 *  page DOM. */
let panelOpen = false;

// ── L2 language state ────────────────────────────────────────────────────

/** The user's chosen L2 (persisted in chrome.storage.local). Single source of truth.
 *  Only changes when the user explicitly picks an L2 via the dropdown or mismatch prompt. */
let savedL2Code = 'en';

/** The language detected from the current video's subtitles (for mismatch check).
 *  Set by track metadata or heuristic detection — never used for lemmatization. */
let detectedSubLang = null;

/** The user's native / UI language. Defaults to 'en'. Changed via L1 dropdown. */
let L1_CODE = 'en';

/** YouTube caption tracks cache (for L2 switcher) */
let ytCaptionTracks = [];
let ytPlayerResponse = null;

// ── L2 Mismatch Detection ────────────────────────────────────────────────
// The mismatch prompt now renders in the side panel. The content script only
// detects the mismatch and folds it into the pushed panel state
// (buildPanelState) — no page DOM banner. Kept as a no-op for call-site
// clarity; the following renderTranscript/pushPanelState carries the state.

function checkL2Mismatch() {}

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

/** Log the parsed cue time range so timestamp-offset issues are visible. */
function logCueTimeRange(source) {
  const first = STATE.cues[0];
  const last = STATE.cues[STATE.cues.length - 1];
  if (!first || !last) {
    log(`[TIME] ${source}: 0 cues`);
    return;
  }
  log(`[TIME] ${source}: ${STATE.cues.length} cues, first=${first.start.toFixed(3)}-${first.end.toFixed(3)}, last=${last.start.toFixed(3)}-${last.end.toFixed(3)}`);
}

/** Normalize subtitle text for comparison (ignores all whitespace, including
 *  line breaks, so a rendered \n matches the same text without one). */
function normalizeForMatch(text) {
  return (text || '').replace(/\s+/g, '');
}

/** Copy Netflix's rendered line breaks onto a matching cue so the panel
 *  displays exactly what the player shows. */
function applyNetflixDisplayedLineBreaks(cueIdx, displayed) {
  const cue = STATE.cues[cueIdx];
  if (!cue || !displayed || !displayed.includes('\n')) return;
  if (normalizeForMatch(cue.text) === normalizeForMatch(displayed)) {
    cue.text = displayed;
  }
}

/** Log the current Netflix player subtitle and the panel's matched line only
 *  when either side changes, so the console stays quiet during playback. */
function logNetflixSyncPair(timeSec, displayed, panelIdx) {
  const playerChanged = displayed !== lastLoggedPlayerText;
  const panelChanged = panelIdx !== lastLoggedPanelIdx;
  if (!playerChanged && !panelChanged) return;

  lastLoggedPlayerText = displayed;
  lastLoggedPanelIdx = panelIdx;

  const panelCue = panelIdx >= 0 ? STATE.cues[panelIdx] : null;
  const video = getVideoElement();
  const videoTime = video?.currentTime;
  log(
    `[SYNC] player: ${JSON.stringify((displayed || '(none)').slice(0, 60))} @ ${timeSec.toFixed(3)}s ` +
    `(video=${videoTime !== undefined ? videoTime.toFixed(3) : 'n/a'}s, api=${netflixPlayerApiTime !== null ? netflixPlayerApiTime.toFixed(3) : 'n/a'}s)`
  );
  log(
    '[SYNC] panel: ' +
    (panelCue
      ? `idx ${panelIdx} ${JSON.stringify(panelCue.text.slice(0, 60))} @ ${panelCue.start.toFixed(3)}s (${panelCue.start.toFixed(3)}-${panelCue.end.toFixed(3)})`
      : 'no matching cue')
  );
}

/** Read the subtitle Netflix is currently rendering on screen.
 *  Netflix exposes the active timed-text element as .player-timedtext,
 *  sometimes inside a shadow root. */
function getNetflixDisplayedSubtitle() {
  const candidates = [];
  const seen = new Set();

  function collect(root) {
    let nodes;
    try {
      nodes = root.querySelectorAll('.player-timedtext');
    } catch {
      return;
    }
    nodes.forEach((el) => {
      const rawText = ((el.innerText || el.textContent) || '').replace(/\r\n/g, '\n').trim();
      const text = normalizeForMatch(rawText);
      if (!rawText || seen.has(text)) return;
      try {
        if (el.getClientRects().length === 0) return;
      } catch {
        return;
      }
      seen.add(text);
      candidates.push({ el, text, rawText });
    });

    try {
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) collect(el.shadowRoot);
      });
    } catch {}
  }

  collect(document);
  return candidates[candidates.length - 1]?.rawText || '';
}

/** Find the cue whose text matches what Netflix is displaying, closest to
 *  the current content time. Re-anchors the active line and re-derives the
 *  ad/timeline offset when video.currentTime no longer aligns with cues. */
function syncNetflixActiveCueFromDisplayed(timeSec) {
  if (!isNetflix) return 'no';

  const now = Date.now();
  if (now - lastNetflixDisplayedCheckAt < 500) return 'throttled';
  lastNetflixDisplayedCheckAt = now;

  const displayed = getNetflixDisplayedSubtitle();
  if (!displayed) return 'no';

  const contentTime = timeSec - netflixTimelineOffset;
  const displayedNormalized = normalizeForMatch(displayed);
  const displayedLines = displayed.split('\n').map(normalizeForMatch).filter(Boolean);
  const stripSpeakerLabel = (line) =>
    line.replace(/^[（(][^）)]*[）)]\s*/, '').trim();

  const cueMatchStrength = (cueText) => {
    if (cueText === displayedNormalized || displayedLines.includes(cueText)) return 2;
    if (cueText.length >= 6 &&
        (displayedNormalized.includes(cueText) || cueText.includes(displayedNormalized))) return 1;
    if (cueText.length >= 4) {
      for (const line of displayedLines) {
        if (stripSpeakerLabel(line).endsWith(cueText)) return 0;
      }
    }
    return -1;
  };

  let bestIdx = -1;
  let bestDiff = Infinity;
  let bestStrength = -1;
  for (let i = 0; i < STATE.cues.length; i++) {
    const cueText = normalizeForMatch(STATE.cues[i].text);
    if (!cueText) continue;
    const strength = cueMatchStrength(cueText);
    if (strength < 0) continue;
    const diff = Math.abs(STATE.cues[i].start - contentTime);
    if (strength > bestStrength || (strength === bestStrength && diff < bestDiff)) {
      bestDiff = diff;
      bestIdx = i;
      bestStrength = strength;
    }
  }

  if (bestIdx < 0) {
    logNetflixSyncPair(timeSec, displayed, -1);
    return 'no';
  }
  const cue = STATE.cues[bestIdx];
  applyNetflixDisplayedLineBreaks(bestIdx, displayed);
  const newOffset = timeSec - cue.start;
  if (bestStrength >= 1 && Math.abs(newOffset - netflixTimelineOffset) > 0.5) {
    log(`[TIME] Netflix timeline offset ${netflixTimelineOffset.toFixed(3)}s → ${newOffset.toFixed(3)}s (ad seek?)`);
    netflixTimelineOffset = newOffset;
  }

  if (bestIdx === STATE.activeCueIdx) return 'matched';
  STATE.activeCueIdx = bestIdx;
  logNetflixSyncPair(timeSec, displayed, bestIdx);
  renderTranscript();
  return 'matched';
}

/** Get the current playback time in seconds.
 *  Prefers video.currentTime (matches subtitle cue timestamps).
 *  Falls back to Disney+ internal API if video element unavailable. */
function getCurrentTime() {
  const video = getVideoElement();
  // Netflix's player API reports the content timeline, which stays correct
  // across ad breaks even when <video>.currentTime shifts.
  if (isNetflix && netflixPlayerApiTime !== null && netflixPlayerApiTime > 0) return netflixPlayerApiTime;
  if (video && video.currentTime > 0) return video.currentTime;
  // Disney+ fallback: internal player API (may have offset from cues)
  if (isDisneyPlus) {
    try {
      const dwp = document.querySelector('disney-web-player');
      const ms = dwp?.mediaPlayer?.timeline?.info?.playheadPositionMs;
      if (typeof ms === 'number') return ms / 1000;
    } catch {}
  }
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
  // Immediately highlight the target cue — don't wait for video to catch up
  const targetIdx = findActiveCueIndex(timeSec);
  const seekTarget = isNetflix ? timeSec + netflixTimelineOffset : timeSec;
  if (targetIdx >= 0) {
    STATE.activeCueIdx = targetIdx;
  }

  // Lock time-based updates for 400ms to prevent seek/timeupdate race
  // where the video reports slightly-off currentTime and causes jumping
  seekLockUntil = Date.now() + 400;

  if (isNetflix) {
    // Netflix: must use player API (M7375 DRM error on direct currentTime)
    chrome.runtime.sendMessage({ action: 'netflixSeek', timeSec: seekTarget })
      .then(() => setTimeout(refreshNetflixPlayerApiTime, 200))
      .catch((err) => logerr('[SEEK] Netflix seek message failed:', err));
  } else if (isDisneyPlus) {
    // Disney+: use internal mediaPlayer API (more reliable than video element)
    try {
      const dwp = document.querySelector('disney-web-player');
      if (dwp?.mediaPlayer?.seek) {
        dwp.mediaPlayer.seek(seekTarget * 1000);
      }
    } catch {}
    // Fallback: also try direct video currentTime
    const video = getVideoElement();
    if (video) video.currentTime = seekTarget;
  } else {
    const video = getVideoElement();
    if (video) {
      video.currentTime = seekTarget;
    }
  }
  renderTranscript();
}

// ── Panel State Push ──────────────────────────────────────────────────────
// The transcript now renders inside the native side panel (chrome.sidePanel).
// Every point that used to re-render the in-page React panel now pushes the
// full panel state; the background relays it to the side panel host.

function clearDetectionTimer() {
  if (detectionTimer) {
    clearTimeout(detectionTimer);
    detectionTimer = null;
  }
}

function setSubtitleDetectionState(status, error = null) {
  STATE.subtitleStatus = status;
  STATE.subtitleError = error ? String(error) : null;
  pushPanelState();
}

function buildPanelState(loadingL2) {
  // Extract video title — strip platform suffixes like " | Prime Video", " - YouTube"
  const rawTitle = document.title || '';
  const videoTitle = rawTitle.replace(/\s*[|\\-]\s*(Prime Video|YouTube|Netflix|Disney\+|Hulu|Max|HBO Max).*$/i, '').trim() || rawTitle;
  const mismatch =
    detectedSubLang && savedL2Code && baseCode(detectedSubLang) !== baseCode(savedL2Code)
      ? { detected: detectedSubLang, saved: savedL2Code }
      : null;
  return {
    mode: 'video',
    cues: STATE.cues,
    activeCueIdx: STATE.activeCueIdx,
    l2Code: savedL2Code,
    l1Code: L1_CODE,
    videoTitle,
    pageUrl: location.href,
    loadingL2,
    subtitleStatus: STATE.subtitleStatus,
    subtitleError: STATE.subtitleError,
    localeVersion: getLocaleVersion(),
    webUrl: buildWebUrl(),
    mismatch,
  };
}

// Build the side-panel state WITHOUT ever letting a throw take down the panel's
// mode resolution. buildPanelState() calls getLocaleVersion()/buildWebUrl()/
// document.title; if any of those throws intermittently, the getPanelState
// handler would fail to sendResponse and the side panel would see
// "Receiving end does not exist" (no content script) and strand the learner on
// "this page cannot be translated" until a full reload. Fall back to a minimal
// but valid video state so the subs tab still resolves.
function safeBuildPanelState(loadingL2) {
  try {
    return buildPanelState(loadingL2);
  } catch (err) {
    logerr('[CONTENT] buildPanelState failed; returning minimal state', err);
    return {
      mode: 'video',
      cues: STATE.cues,
      activeCueIdx: STATE.activeCueIdx,
      l2Code: savedL2Code,
      l1Code: L1_CODE,
      pageUrl: location.href,
      loadingL2,
      subtitleStatus: STATE.subtitleStatus || 'error',
      subtitleError: STATE.subtitleError || `state-build-error: ${(err && err.message) || String(err)}`,
      // These are safe module values only — avoid re-calling the same helpers
      // that may have thrown (getLocaleVersion, buildWebUrl).
      localeVersion: 0,
      mismatch: null,
      videoTitle: document.title || '',
    };
  }
}

function pushPanelState(loadingL2) {
  try {
    chrome.runtime.sendMessage({ action: 'panelState', state: safeBuildPanelState(loadingL2) })
      .catch(() => {});
  } catch {}
}

function renderTranscript(loadingL2) {
  pushPanelState(loadingL2);
}

// ── Subtitle Fetching ────────────────────────────────────────────────────

/**
 * Merge new cue segments into the existing cue list. Disney+ loads VTT
 * subtitles in time-bounded segments (seg_00001.vtt, seg_00002.vtt, …).
 * Each segment only covers ~2-5 minutes. We merge instead of replacing
 * so that seeking doesn't lose previously loaded segments.
 */
function mergeCues(existing, incoming) {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  // Build a set of existing start times for O(1) dedup
  const existingStarts = new Set(existing.map(c => c.start));

  // Add only new cues (not already in the list)
  const merged = [...existing];
  for (const cue of incoming) {
    if (!existingStarts.has(cue.start)) {
      merged.push(cue);
    }
  }

  // Sort by start time
  merged.sort((a, b) => a.start - b.start);

  // Fix overlapping end times
  for (let i = 0; i < merged.length - 1; i++) {
    if (merged[i].end > merged[i + 1].start) {
      merged[i].end = merged[i + 1].start - 0.001;
    }
  }

  return merged;
}

/**
 * Trim cues that are more than 10 minutes away from the current playback
 * position. Prevents unbounded memory growth from accumulated segments.
 */
function trimDistantCues(cues, currentTimeSec) {
  const windowSec = 600; // 10 minutes
  return cues.filter(c => c.end >= currentTimeSec - windowSec && c.start <= currentTimeSec + windowSec);
}

/**
 * Begin an explicit, idempotent detection pass for the side panel. Platform
 * interception continues independently; this request only asks the existing
 * platform pipeline to resolve its current state and gives the panel a
 * generation it can use to ignore stale retries.
 */
async function requestSubtitleDetection({ retry = false } = {}) {
  if (!retry && STATE.cues.length > 0) {
    setSubtitleDetectionState('ready');
    return;
  }
  if (!retry && STATE.subtitleStatus === 'detecting' && detectionPromise) {
    return detectionPromise;
  }

  const generation = ++detectionGeneration;
  clearDetectionTimer();
  if (retry) {
    fetchGen++;
    STATE.cues = [];
    STATE.activeCueIdx = -1;
    STATE.subtitleUrl = null;
  }
  STATE.loading = true;
  STATE.subtitleStatus = 'detecting';
  STATE.subtitleError = null;
  pushPanelState();

  const promise = (async () => {
    if (isYouTube) {
      await loadYouTubeSubtitles(generation);
    } else if (isNetflix && Object.keys(cachedNetflixTracks).length > 0) {
      const lang = savedL2Code;
      await loadNetflixTrackForLanguage(lang);
    } else {
      // Prime Video, Disney+, Hulu, and Max are fed by the existing network
      // interception path. Re-arm time tracking and wait for that signal.
      attachTimeTracking();
    }

    if (generation !== detectionGeneration) return;
    STATE.loading = false;
    if (STATE.cues.length > 0) {
      setSubtitleDetectionState('ready');
      return;
    }

    detectionTimer = setTimeout(() => {
      if (generation !== detectionGeneration || STATE.cues.length > 0) return;
      STATE.loading = false;
      setSubtitleDetectionState('empty');
    }, 8000);
  })().catch((err) => {
    if (generation !== detectionGeneration) return;
    STATE.loading = false;
    setSubtitleDetectionState('error', err?.message || t('failedToLoadSubtitles'));
  }).finally(() => {
    if (generation === detectionGeneration) detectionPromise = null;
  });

  detectionPromise = promise;
  return promise;
}

async function fetchAndParseSubtitles(url) {
  // Block duplicate URLs and set URL BEFORE async fetch to prevent
  // concurrent fetches of different URLs from racing each other.
  if (STATE.subtitleUrl === url) return;
  STATE.subtitleUrl = url;
  STATE.loading = true;
  STATE.subtitleStatus = 'detecting';
  STATE.subtitleError = null;

  trace('FETCH', `URL detected: ${url.substring(0, 120)}`);

  // For Disney+: don't clear existing cues — we're loading a VTT segment
  // that covers only part of the timeline. Merge it in instead.
  const isDisneySegment = isDisneyPlus && /\.vtt(\?|$)/i.test(url);
  if (!isDisneySegment) {
    STATE.cues = [];
    renderTranscript(savedL2Code);
  }
  updateStatus(t('loadingSubtitles'));

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

    // For non-Disney+ platforms: discard if a newer fetch started
    // (prevents stale cues from overwriting newer ones).
    // Disney+ segments are merged — every segment must complete.
    if (!isDisneySegment && fetchGen !== gen) return;

    // Disney+ VTT segments: merge into existing cues
    if (isDisneySegment && STATE.cues.length > 0) {
      cues = mergeCues(STATE.cues, cues);
      log('Merged Disney+ segment, total cues:', cues.length);
    }

    STATE.cues = cues;
    logCueTimeRange('subtitle fetch');

    trace('PARSE', `${cues.length} cues parsed from subtitle text`);

    // Try to detect language from subtitle content
    tryDetectL2FromCues(cues, (v) => { detectedSubLang = v; });
    checkL2Mismatch();

    if (cues.length === 0) {
      clearDetectionTimer();
      setSubtitleDetectionState('empty');
    } else {
      clearDetectionTimer();
      STATE.activeCueIdx = -1;
      STATE.subtitleStatus = 'ready';
      STATE.subtitleError = null;
      renderTranscript();
      updateStatus('');
      // Note: the panel can no longer auto-open (chrome.sidePanel.open()
      // requires a user gesture). The user opens it via the popup button or
      // the Alt+T / Ctrl+Shift+Y keyboard shortcut; state stays ready.
    }
  } catch (err) {
    if (fetchGen !== gen) return;
    logerr('Failed to fetch/parse subtitles:', err);
    clearDetectionTimer();
    setSubtitleDetectionState('error', err?.message || t('failedToLoadSubtitles'));
    updateStatus(t('failedToLoadSubtitles'));
  } finally {
    STATE.loading = false;
  }
}

// ── YouTube Subtitle Integration ─────────────────────────────────────────

/** Language code aliases — variant codes that share the same display name */
const LANG_ALIASES = {
  arb: 'ar', // Modern Standard Arabic → Standard Arabic
};

/** Get the lang-names entry for a code, following aliases if needed */
function getLangEntry(code) {
  return langNames[code] || langNames[LANG_ALIASES[code]];
}

/** Get a readable language name for display in the dropdown.
 *  Uses translations from the monorepo's translations.csv (lang.* keys),
 *  resolved against the extension's selected L1 (UI language), not the browser's. */
function languageName(code) {
  const entry = getLangEntry(code);
  if (!entry) return code.toUpperCase();

  // Use the extension's selected L1, not the browser's UI language
  const uiLang = L1_CODE;
  const chromeLocale = CSV_TO_CHROME_LOCALE[uiLang] || uiLang;

  // Direct match via Chrome locale key (e.g., zh_CN, fr, ja)
  if (entry[chromeLocale]) return entry[chromeLocale];

  // Try the raw CSV code (e.g., zh-Hans)
  if (entry[uiLang]) return entry[uiLang];

  // Try stripping region suffix
  const bare = uiLang.replace(/[-_][A-Z]{2}$/i, '');
  if (bare !== uiLang && entry[bare]) return entry[bare];

  // Fallback: try English
  if (entry.en) return entry.en;

  return code.toUpperCase();
}

/** Build the sorted L2 list: popular first, then rest alphabetically by name */
function getSortedL2List() {
  const popularSet = new Set(POPULAR_L2S);
  const popular = POPULAR_L2S.filter(c => CONTENT_L2S.includes(c));
  const rest = CONTENT_L2S.filter(c => !popularSet.has(c));
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
    log('No INNERTUBE_API_KEY found');
    return [];
  }

  log('InnerTube API key:', apiKey.substring(0, 8) + '...');

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
      log('InnerTube HTTP', res.status);
      return [];
    }

    const data = await res.json();
    const captions = data?.captions?.playerCaptionsTracklistRenderer;
    if (!captions?.captionTracks) {
      log('InnerTube: no caption tracks');
      return [];
    }

    const tracks = captions.captionTracks.map(t => ({
      baseUrl: (t.baseUrl || '').replace(/&fmt=srv3/, '').replace(/&fmt=vtt/, ''),
      languageCode: t.languageCode,
      kind: t.kind || '',
      name: t.name?.runs?.[0]?.text || t.name?.simpleText || '',
    }));

    log('InnerTube found', tracks.length, 'tracks:',
      tracks.map(t => `${t.languageCode}${t.kind === 'asr' ? ' (auto)' : ''}`).join(', '));

    return tracks;
  } catch (err) {
    logerr('InnerTube fetch failed:', err?.message);
    return [];
  }
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
async function fetchYTTrack(track, requestGeneration = detectionGeneration) {
  try {
    if (requestGeneration !== detectionGeneration) return;
    trace('FETCH', `YouTube track: ${track.languageCode} (kind=${track.kind || 'manual'})`);
    STATE.subtitleStatus = 'detecting';
    STATE.subtitleError = null;
    updateStatus(t('loadingSubtitles'));

    // Ensure URL is absolute
    let url = track.baseUrl;
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) url = 'https://www.youtube.com' + url;

    log('MAIN fetching:', url.substring(0, 100));

    let text = await mainWorldFetch(url);
    log('MAIN response:', text.length, 'chars');
    if (text.length < 1000) log('Response preview:', text.substring(0, 500));

    let cues;

    if (!text || text.length === 0) {
      // Fall back to unsigned JSON3 URL
      const videoId = getYTVideoId();
      const lang = track.languageCode || 'en';
      text = await mainWorldFetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`);
      log('Fallback MAIN response:', text.length, 'chars');
      if (!text || text.length === 0) {
        log('MAIN also returned empty');
        return;
      }
      cues = parseYTJSON3(text);
    } else if (text.trim().startsWith('<')) {
      cues = parseYTTimedText(text);
    } else {
      try { cues = parseYTJSON3(text); } catch { cues = parseYTTimedText(text); }
    }

    log('Parsed', cues.length, 'cues');

    // Auto-generated (ASR) captions: anchor each line to its first word's
    // start / last word's end so the active line matches what the speaker is
    // saying now (word-level timing), rather than a constant lead shift.
    if (track.kind === 'asr') {
      const wordCues = cues.filter((c) => Array.isArray(c.words) && c.words.length > 0).length;
      log(`[TIME] ASR caption alignment: ${wordCues}/${cues.length} cues carry word timing; anchoring line start to first word`);
      cues = applyASRWordTiming(cues);
    }

    if (requestGeneration !== detectionGeneration) return;
    // Strip the transient word-timing field before the cues reach the panel
    // (SubtitleCue is { start, end, text }; words only inform ASR alignment).
    STATE.cues = cues.map(({ start, end, text }) => ({ start, end, text }));
    STATE.subtitleUrl = track.baseUrl;
    logCueTimeRange('YouTube');

    trace('PARSE', `${cues.length} YouTube cues parsed`);

    if (track.languageCode) {
      detectedSubLang = track.languageCode.split('-')[0];
    }
    tryDetectL2FromCues(cues, (v) => { detectedSubLang = v; });
    checkL2Mismatch();

    if (cues.length > 0) {
      clearDetectionTimer();
      STATE.subtitleStatus = 'ready';
      STATE.subtitleError = null;
      STATE.activeCueIdx = -1;
      renderTranscript();
    } else {
      clearDetectionTimer();
      setSubtitleDetectionState('empty');
    }
    setBadge(true);
    updateStatus('');
  } catch (err) {
    if (requestGeneration !== detectionGeneration) return;
    logerr('Failed to fetch YouTube subtitles:', err);
    clearDetectionTimer();
    setSubtitleDetectionState('error', err?.message || t('failedToLoadSubtitles'));
    updateStatus(t('failedToLoadSubtitles'));
  }
}

/** Load YouTube subtitles — discover tracks and pick the best one */
async function loadYouTubeSubtitles(requestGeneration = detectionGeneration) {
  const videoId = getYTVideoId();
  if (!videoId) {
    log('No YouTube video ID found in URL');
    setSubtitleDetectionState('empty');
    return;
  }

  log('Looking for caption data...');

  // Try InnerTube API first (mimics ANDROID client)
  let tracks = await fetchInnerTubeTracks(videoId);
  if (requestGeneration !== detectionGeneration) return;

  if (tracks.length === 0) {
    // Fall back to ytInitialPlayerResponse from the page
    let pr = getYTPlayerResponse();
    let attempts = 0;
    while (!pr && attempts < 30) {
      await new Promise(r => setTimeout(r, 500));
      if (requestGeneration !== detectionGeneration) return;
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
    log('No caption tracks found');
    setSubtitleDetectionState('empty');
    return;
  }

  // Pick best track: prefer manual matching saved L2

  // Pick best track: prefer manual matching saved L2
  let best = null;
  const l2Matches = tracks.filter(t => t.languageCode === savedL2Code || t.languageCode?.startsWith(savedL2Code));
  if (l2Matches.length > 0) {
    best = l2Matches.find(t => t.kind !== 'asr') || l2Matches[0];
  }
  if (!best) {
    best = tracks.find(t => t.kind !== 'asr') || tracks[0];
  }

  if (best) {
    log('Loading track:', best.languageCode, best.kind === 'asr' ? '(auto)' : '');
    await fetchYTTrack(best, requestGeneration);
  }
}

/** CSV-style locale → Chrome _locales/ directory name.
 *  Used to look up endonyms in lang-names.json. */
const CSV_TO_CHROME_LOCALE = {
  'en': 'en', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', 'ar': 'ar', 'de': 'de',
  'es': 'es', 'fr': 'fr', 'id': 'id', 'it': 'it', 'ja': 'ja', 'ko': 'ko',
  'nl': 'nl', 'pl': 'pl', 'pt': 'pt', 'ru': 'ru', 'th': 'th', 'tr': 'tr',
  'vi': 'vi',
};

/** UI languages for the L1 (interface) dropdown — ADR-0033's 18 core
 *  locales, sourced from @langplayer/shared (SUPPORTED_L1S). */
const UI_LANGUAGES = SUPPORTED_L1S;

/** Handle L1 (interface) language change */
async function onL1Change(newCode) {
  if (newCode === L1_CODE) return;
  L1_CODE = newCode;

  // Persist user preference
  try {
    chrome.storage.local.set({ l1Language: newCode });
  } catch {}

  // Load locale messages for UI translation (panel labels, tooltips, status)
  await setLocale(newCode);

  log('L1 changed to:', newCode);
  // Re-render transcript with new L1 (re-triggers translation with new l1Code)
  renderTranscript();
}

/** Load the user's saved language preferences from storage */
async function loadSavedLanguagePreferences() {
  try {
    const result = await chrome.storage.local.get(['l2Language', 'l1Language']);
    if (result.l2Language && CONTENT_L2S.includes(result.l2Language)) {
      savedL2Code = result.l2Language;
      log('Loaded saved L2 preference:', savedL2Code);
    }
    if (result.l1Language && UI_LANGUAGES.includes(result.l1Language)) {
      L1_CODE = result.l1Language;
      log('Loaded saved L1 preference:', L1_CODE);
    }
  } catch {}
}

/** Handle L2 language change from the dropdown */
async function onL2Change(newCode) {
  if (newCode === savedL2Code) return;
  savedL2Code = newCode;

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
      savedL2Code = newCode;
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

  const handleNavigation = (currentId) => {
    if (!currentId || currentId === lastVideoId) return;
    lastVideoId = currentId;
    log(`Navigated to video: ${currentId}`);
    // Close the side panel on video change: an autoplaying "up next" would
    // otherwise keep the panel tokenizing / translating / calling the
    // subscription endpoint on a video the learner has left. Reopening is a
    // deliberate user action (icon / shortcut / token click).
    try {
      chrome.runtime.sendMessage({ action: 'closePanel' }).catch(() => {});
    } catch {}
    // Clear the previous video's transcript immediately so the side panel
    // doesn't keep showing the prior video's subtitles while the new video's
    // caption track loads (or while it resolves to "no subtitles").
    STATE.cues = [];
    STATE.activeCueIdx = -1;
    STATE.subtitleUrl = null;
    STATE.subtitleError = null;
    ytCaptionTracks = [];
    ytPlayerResponse = null;
    setSubtitleDetectionState('detecting');
    setTimeout(() => loadYouTubeSubtitles(), 1500);
  };

  ytNavObserver = new MutationObserver(() => {
    handleNavigation(getYTVideoId());
  });
  ytNavObserver.observe(document.body, { childList: true, subtree: true });

  // YouTube dispatches yt-navigate-finish after its SPA routing swaps the
  // player. This catches navigation the DOM mutation observer can miss (e.g.
  // an in-place player swap without a subtree change), so the transcript is
  // cleared before the new video's captions render.
  window.addEventListener('yt-navigate-finish', () => {
    handleNavigation(getYTVideoId());
  });
}

/** Notify background script to set/unset badge */
function setBadge(found) {
  try {
    chrome.runtime.sendMessage({ action: 'setBadge', found });
  } catch {}
}

// ── Panel UI ─────────────────────────────────────────────────────────────
// The panel UI (header, transcript, page reader) now lives in the native
// side panel (src/sidepanel.jsx). This content script no longer creates any
// page DOM for it — it only computes the web-app link for the header button
// and pushes panel state (see buildPanelState above).

/** Web app URL for the current page.
 *  - YouTube video with subtitles loaded → watch page: {l1}/{l2}/watch/{videoId}
 *  - everything else → null (no web-app button) */
function buildWebUrl() {
  const base = `https://language-player.netlify.app/${encodeURIComponent(L1_CODE)}/${encodeURIComponent(savedL2Code)}`;
  const videoId = getYTVideoId();
  if (isYouTube && videoId && STATE.cues.length > 0) {
    return { url: `${base}/watch/${encodeURIComponent(videoId)}`, labelKey: 'watchInLanguagePlayer' };
  }
  return null;
}

/** Status messages now surface in the side panel via the pushed state
 *  (loadingL2) — kept as a log-only hook for the old call sites. */
function updateStatus(message) {
  if (message) {
    log('[STATUS]', message);
  }
}

// ── Time Tracking ────────────────────────────────────────────────────────

let timeUpdateRaf = null;
/** Timestamp (Date.now()) until which time-based active-cue updates are suppressed.
 *  Set by seekTo() to prevent racing between seek completion and timeupdate events. */
let seekLockUntil = 0;

function updateActiveCue(timeSec) {
  // Skip time-based updates during the seek lock window
  if (Date.now() < seekLockUntil) return;

  const newIdx = findActiveCueIndex(timeSec);
  if (newIdx >= 0) {
    if (newIdx === STATE.activeCueIdx) return;
    STATE.activeCueIdx = newIdx;
    if (isNetflix) {
      const displayed = getNetflixDisplayedSubtitle();
      applyNetflixDisplayedLineBreaks(newIdx, displayed);
      logNetflixSyncPair(timeSec, displayed, newIdx);
    }
    renderTranscript();
    return;
  }

  // No time match — try to re-anchor from the subtitle Netflix is rendering.
  const displaySync = syncNetflixActiveCueFromDisplayed(timeSec);
  if (displaySync === 'matched') return;

  // If the displayed-text re-check is throttled, keep the current highlight
  // until the next check rather than flickering it off.
  if (displaySync === 'throttled' && STATE.activeCueIdx >= 0) return;

  if (STATE.activeCueIdx === -1) return;
  STATE.activeCueIdx = newIdx;
  renderTranscript();
}

function onTimeUpdate() {
  if (timeUpdateRaf) return;
  timeUpdateRaf = requestAnimationFrame(() => {
    timeUpdateRaf = null;
    if (STATE.cues.length > 0) {
      // Periodically trim cues far from current position (Disney+ segment accumulation)
      if (isDisneyPlus && STATE.cues.length > 500) {
        const t = getCurrentTime();
        const trimmed = trimDistantCues(STATE.cues, t);
        if (trimmed.length < STATE.cues.length) {
          STATE.cues = trimmed;
          log('Trimmed cues:', trimmed.length, '(was', STATE.cues.length + ')');
        }
      }
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
        const t = getCurrentTime();
        updateActiveCue(t);
      }
    });
  }
}

/** Netflix subtitle tracks cache (all available tracks from manifest) */
let cachedNetflixTracks = {};
let pendingNetflixActiveLang = null;
let loadedNetflixUrl = null;
let netflixFetchDetectionActive = false;
let handlingNetflixTracks = false;
let netflixObserverStarted = false;
/** Difference between the player's wall-clock/video time and the subtitle
 *  content timeline. Netflix ad breaks can shift this (e.g. after seeking
 *  past an ad); we re-derive it from the subtitle text Netflix is rendering. */
let netflixTimelineOffset = 0;
let lastNetflixDisplayedCheckAt = 0;
let lastLoggedPlayerText = '';
let lastLoggedPanelIdx = -2;
let netflixPlayerApiTime = null;
let currentNetflixMovieId = null;
let pendingNetflixTracks = null;
let lastRouteMovieId = null;

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
      log('Received Netflix tracks from MAIN world:', event.data.tracks.length);
      const movieId = event.data.movieId != null ? String(event.data.movieId) : null;
      const routeMovieId = getNetflixRouteMovieId();

      // Netflix prefetches the next episode's manifest while the current
      // episode is still playing. Keep the current panel until the route
      // actually changes to that movieId.
      if (routeMovieId && movieId && movieId !== routeMovieId && STATE.cues.length > 0) {
        log('Queueing Netflix tracks for upcoming movieId:', movieId, '(route', routeMovieId + ')');
        pendingNetflixTracks = { movieId, tracks: event.data.tracks };
        return;
      }

      pendingNetflixTracks = null;
      if (movieId) currentNetflixMovieId = movieId;
      handlingNetflixTracks = true;
      handleNetflixSubs(event.data.tracks, movieId).finally(() => {
        handlingNetflixTracks = false;
        processPendingNetflixActiveLang();
      });
    }

    if (event.data.type === 'netflixActiveLang') {
      const lang = event.data.language;
      if (!lang) return;
      const movieId = event.data.movieId != null ? String(event.data.movieId) : null;
      const routeMovieId = getNetflixRouteMovieId();
      if (routeMovieId && movieId && movieId !== routeMovieId && STATE.cues.length > 0) {
        return;
      }
      log('Netflix active subtitle fetch detected:', lang);
      netflixFetchDetectionActive = true;
      pendingNetflixActiveLang = lang;
      if (!handlingNetflixTracks) processPendingNetflixActiveLang();
    }
  });

  // Inject the MAIN world script synchronously via <script src> tag.
  // At document_start, document.head may not exist yet.
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dist/netflix-main-world.js');
  (document.head || document.documentElement).appendChild(script);
  log('Netflix interceptor injected via <script src>');
}

/** Load the most recent fetch-detected active subtitle language, once tracks
 *  are cached and no track-manifest handling is in progress. */
function processPendingNetflixActiveLang() {
  if (!pendingNetflixActiveLang) return;
  if (Object.keys(cachedNetflixTracks).length === 0) return;

  const lang = pendingNetflixActiveLang;
  pendingNetflixActiveLang = null;
  loadNetflixTrackForLanguage(lang);
}

/** Extract the currently open Netflix title id from /watch/<id>. */
function getNetflixRouteMovieId() {
  try {
    const m = location.pathname.match(/\/watch\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
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

/** Refresh the Netflix player API's content timeline (excludes ad shifts). */
async function refreshNetflixPlayerApiTime() {
  if (!isNetflix) return;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'netflixGetPlayerTime' });
    if (res && typeof res.playerTime === 'number' && isFinite(res.playerTime)) {
      netflixPlayerApiTime = res.playerTime;
    }
  } catch {}
}

/**
 * Start watching for Netflix subtitle changes. Netflix recreates text tracks
 * when the user changes subtitles, so we poll video.textTracks.
 */
function observeNetflixSubtitleChanges() {
  if (netflixObserverStarted) return;
  netflixObserverStarted = true;
  let lastActiveLang = null;

  setInterval(async () => {
    const routeMovieId = getNetflixRouteMovieId();
    if (routeMovieId && routeMovieId !== lastRouteMovieId) {
      lastRouteMovieId = routeMovieId;
      if (pendingNetflixTracks && pendingNetflixTracks.movieId === routeMovieId) {
        const pending = pendingNetflixTracks;
        pendingNetflixTracks = null;
        log('Applying queued Netflix tracks for route:', routeMovieId);
        handlingNetflixTracks = true;
        handleNetflixSubs(pending.tracks, pending.movieId).finally(() => {
          handlingNetflixTracks = false;
          processPendingNetflixActiveLang();
        });
      }
    } else if (!lastRouteMovieId) {
      lastRouteMovieId = routeMovieId;
    }

    await refreshNetflixPlayerApiTime();

    // Fetch/XHR interception is the authoritative signal for the active
    // track. Only use textTracks polling when we never saw a subtitle fetch.
    if (netflixFetchDetectionActive) return;

    const activeLang = await detectNetflixActiveSubtitle();
    if (activeLang && activeLang !== lastActiveLang && cachedNetflixTracks[activeLang]) {
      lastActiveLang = activeLang;
      log('Netflix subtitle changed to:', activeLang);
      await loadNetflixTrackForLanguage(activeLang);
    }
  }, 1000);
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
    log('No cached Netflix track for language:', langCode);
    return;
  }

  const track = cachedNetflixTracks[bestKey];
  if (track.url === loadedNetflixUrl && STATE.cues.length > 0) {
    log('Netflix track already loaded:', track.url);
    return;
  }
  const gen = ++fetchGen;
  log('Loading Netflix track:', bestKey, track.format);

  // Clear old cues and show spinner
  STATE.cues = [];
  STATE.subtitleStatus = 'detecting';
  STATE.subtitleError = null;
  renderTranscript(bestKey);
  updateStatus(t('loadingSubtitles'));

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

    log('Netflix parsed', cues.length, 'cues');

    STATE.cues = cues;
    logCueTimeRange('Netflix');
    detectedSubLang = track.languageCode || detectedSubLang;
    tryDetectL2FromCues(cues, (v) => { detectedSubLang = v; });
    checkL2Mismatch();
    loadedNetflixUrl = track.url;

    if (cues.length > 0) {
      clearDetectionTimer();
      STATE.subtitleStatus = 'ready';
      STATE.subtitleError = null;
      STATE.activeCueIdx = -1;
      renderTranscript();
    } else {
      clearDetectionTimer();
      setSubtitleDetectionState('empty');
    }
    setBadge(true);
    updateStatus('');
  } catch (err) {
    if (fetchGen !== gen) return;
    logerr('Failed to fetch Netflix subtitles:', err);
    clearDetectionTimer();
    setSubtitleDetectionState('error', err?.message || t('failedToLoadSubtitles'));
    updateStatus(t('failedToLoadSubtitles'));
  }
}

/** Process Netflix subtitle tracks and fetch the actual subtitle file */
async function handleNetflixSubs(tracks, movieId) {
  if (movieId) currentNetflixMovieId = movieId;

  // New title/manifest — reset any ad/timeline offset learned previously.
  netflixTimelineOffset = 0;
  lastNetflixDisplayedCheckAt = 0;
  netflixPlayerApiTime = null;

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

  log('Netflix subtitle tracks:',
    Object.keys(subs).map(k => `${k} (${subs[k].languageCode})`).join(', '));

  // Prefer the language Netflix actually fetched from the manifest; fall back
  // to probing video.textTracks when no subtitle fetch has been seen yet.
  // Re-check the pending fetch signal after the probe too — it can arrive
  // while the probe is in flight and must not be lost to the fallback.
  let activeLang = pendingNetflixActiveLang;
  if (!activeLang) activeLang = await detectNetflixActiveSubtitle();
  if (!activeLang) activeLang = pendingNetflixActiveLang;
  pendingNetflixActiveLang = null;
  log('Detected Netflix active subtitle:', activeLang || '(none found)');

  if (activeLang) {
    await loadNetflixTrackForLanguage(activeLang);
  } else {
    // Fallback: prefer the saved L2, then first available
    const userL2 = savedL2Code;
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
  if (message.action === 'requestSubtitleDetection') {
    requestSubtitleDetection({ retry: !!message.retry })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'detection failed' }));
    return true;
  }

  if (message.action === 'subtitleDetected') {
    const { url, fileName } = message;
    log('Subtitle detected:', fileName, url);
    fetchAndParseSubtitles(url);
  }

  if (message.action === 'loadSubtitles') {
    const { url } = message;
    fetchAndParseSubtitles(url);
  }

  if (message.action === 'getTranscriptStatus') {
    sendResponse({
      cuesCount: STATE.cues.length,
      savedL2Code,
      detectedSubLang,
      subtitleStatus: STATE.subtitleStatus,
      subtitleError: STATE.subtitleError,
    });
    return true;
  }

  if (message.action === 'panelSeek') {
    // Seek command from the side panel (clicking a cue in the transcript).
    seekTo(message.timeSec);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getPanelState') {
    // Side panel pulled state (open, tab switch, navigation).
    log('[CONTENT] getPanelState answered (video mode)', {
      cues: STATE.cues.length,
      subtitleStatus: STATE.subtitleStatus,
      senderTabId: sender?.tab?.id,
      frameId: sender?.frameId,
    });
    sendResponse({ state: safeBuildPanelState() });
    return true;
  }

  if (message.action === 'panelOpenState') {
    // Background reports the native side panel open/closed state.
    panelOpen = !!message.open;
    sendResponse({ received: true });
    return true;
  }

  if (message.action === 'changeLanguage') {
    // Language picker lives in the popup now; apply the change in the panel.
    log('Language change via popup:', message.l1, '→', message.l2);
    (async () => {
      if (message.l1 && message.l1 !== L1_CODE) await onL1Change(message.l1);
      if (message.l2 && message.l2 !== savedL2Code) await onL2Change(message.l2);
      sendResponse({ success: true });
    })();
    return true; // async response
  }

  // Actions owned by the page-content script (page translation, page lookup,
  // page modals, tokenization toggles) are NOT handled here. Do not respond to
  // them: content scripts are co-injected on video hosts, and
  // chrome.tabs.sendMessage resolves with the FIRST responder. Responding here
  // makes the side panel see this content-entry response and mask the real
  // page-content.js result — e.g. getPageTranslationSnapshot would resolve as
  // { received: true } and surface "this page cannot be translated".
  const PAGE_SCRIPT_ACTIONS = new Set([
    'pageTranslationVisibility',
    'pageTranslationStart',
    'getPageTranslationSnapshot',
    'pageTokenizationOn',
    'pageTokenizationOff',
    'openPageModal',
    'pageLookup',
    'pageFollowLink',
  ]);
  if (PAGE_SCRIPT_ACTIONS.has(message.action)) {
    // No sendResponse — page-content.js owns this message.
    return;
  }

  sendResponse({ received: true });
});

// ── Keyboard Shortcuts ───────────────────────────────────────────────────
// Alt+T / Ctrl+Shift+Y now toggle the native side panel via manifest
// commands (handled by the background service worker). Only cue seeking stays
// here, active while the side panel is open on this tab.

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (!panelOpen) return;

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
  log('Content script loaded');

  // Netflix: inject the JSON.parse monkeypatch IMMEDIATELY, before waiting
  // for the player. Netflix loads its playback manifest early in the page
  // lifecycle — if we wait for the player first, the manifest JSON has
  // already been parsed and our monkeypatch misses it.
  if (isNetflix) {
    setupNetflixInterceptor();
  }

  const playerEl = await waitForPlayer();
  log('Player found');

  // Load saved L1/L2 preferences and locale BEFORE pushing state,
  // so the panel renders in the correct language from the start.
  await loadSavedLanguagePreferences();
  await setLocale(L1_CODE);

  // Push the initial (empty) panel state so the side panel shows the loading
  // empty state instead of nothing while subtitles load.
  pushPanelState();
  setupKeyboard();

  if (isYouTube) {
    // YouTube: extract subs from page data, re-attach time tracking periodically
    await requestSubtitleDetection();
    setupYouTubeNavigationObserver();
    setInterval(() => {
      attachTimeTracking();
    }, 2000);
  } else if (isNetflix) {
    // Netflix: interceptor already set up before waitForPlayer().
    // Cues may have already been loaded while we were waiting for the player.
    // If so, render them now that the panel exists.
    if (STATE.cues.length > 0) {
      log('Pushing pre-loaded cues:', STATE.cues.length);
      STATE.activeCueIdx = -1;
      STATE.subtitleStatus = 'ready';
      renderTranscript();
      setBadge(true);
      updateStatus('');
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
