/**
 * Prime Video Subtitle Viewer — Content Script
 *
 * Injects a collapsible transcript panel alongside the Prime Video player.
 * Parses TTML/XML subtitle files detected by the background service worker,
 * displays time-synced transcript entries, and supports click-to-seek.
 */

(function () {
  'use strict';

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
  let cueElements = [];

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Parse a TTML time string like "00:01:23.456" or "1.5s" to seconds */
  function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;

    // Handle timestamp with hours: "00:01:23.456" or "00:01:23,456"
    const hmsMatch = timeStr.match(/^(\d{1,}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
    if (hmsMatch) {
      const h = parseInt(hmsMatch[1], 10);
      const m = parseInt(hmsMatch[2], 10);
      const s = parseInt(hmsMatch[3], 10);
      let ms = hmsMatch[4];
      // Normalize to 3 digits
      while (ms.length < 3) ms += '0';
      return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
    }

    // Handle "MM:SS.ms" format
    const msMatch = timeStr.match(/^(\d{1,}):(\d{2})[.,](\d{1,3})$/);
    if (msMatch) {
      const m = parseInt(msMatch[1], 10);
      const s = parseInt(msMatch[2], 10);
      let ms = msMatch[3];
      while (ms.length < 3) ms += '0';
      return m * 60 + s + parseInt(ms, 10) / 1000;
    }

    // Handle seconds with unit: "1.5s" or "500ms"
    const unitMatch = timeStr.match(/^([\d.]+)(s|ms|h|m)$/);
    if (unitMatch) {
      const val = parseFloat(unitMatch[1]);
      const unit = unitMatch[2];
      if (unit === 'h') return val * 3600;
      if (unit === 'm') return val * 60;
      if (unit === 'ms') return val / 1000;
      return val; // seconds
    }

    // Plain number (seconds)
    const num = parseFloat(timeStr);
    return isNaN(num) ? 0 : num;
  }

  /** Strip HTML/XML tags from text */
  function stripTags(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
  }

  /** Decode HTML entities */
  function decodeEntities(text) {
    if (!text) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = text;
    return txt.value;
  }

  /** Parse TTML / XML subtitle content into cues */
  function parseTTML(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.warn('[PrimeVideoSubs] XML parse error, trying as HTML');
      const htmlDoc = parser.parseFromString(xmlText, 'text/html');
      return extractCuesFromDoc(htmlDoc);
    }

    return extractCuesFromDoc(doc);
  }

  function extractCuesFromDoc(doc) {
    const cues = [];

    // Try TTML <p> elements
    const paragraphs = doc.querySelectorAll('p');
    for (const p of paragraphs) {
      const begin = p.getAttribute('begin') || p.getAttribute('start') || '';
      const end = p.getAttribute('end') || p.getAttribute('dur') || '';
      const text = stripTags(p.innerHTML || p.textContent || '');

      if (text && begin) {
        const startTime = parseTimeToSeconds(begin);
        let endTime = end ? parseTimeToSeconds(end) : null;

        // If "dur" was used, add to start
        if (p.getAttribute('dur') && !p.getAttribute('end')) {
          endTime = startTime + parseTimeToSeconds(p.getAttribute('dur'));
        }

        cues.push({
          start: startTime,
          end: endTime || startTime + 5, // default 5s duration
          text: decodeEntities(text),
        });
      }
    }

    // Try WebVTT-style cues if no TTML paragraphs found
    if (cues.length === 0) {
      const vttCues = parseWebVTTLike(doc.body?.textContent || '');
      cues.push(...vttCues);
    }

    // Sort by start time
    cues.sort((a, b) => a.start - b.start);

    // Fill in end times from next cue's start if missing
    for (let i = 0; i < cues.length - 1; i++) {
      if (cues[i].end > cues[i + 1].start) {
        cues[i].end = cues[i + 1].start - 0.001;
      }
    }

    return cues;
  }

  /** Fallback parse for WebVTT-like content */
  function parseWebVTTLike(text) {
    const cues = [];
    const lines = text.split(/\r?\n/);
    let i = 0;

    // Skip WebVTT header
    if (lines[0]?.trim() === 'WEBVTT') i = 1;

    while (i < lines.length) {
      // Skip blank lines and cue numbers
      while (i < lines.length && (lines[i].trim() === '' || /^\d+$/.test(lines[i].trim()))) {
        i++;
      }

      if (i >= lines.length) break;

      // Time line: "00:00:01.000 --> 00:00:04.000"
      const timeMatch = lines[i]?.match(/^([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (timeMatch) {
        const start = parseTimeToSeconds(timeMatch[1]);
        const end = parseTimeToSeconds(timeMatch[2]);
        i++;

        // Collect text lines until blank
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

  /** Parse SRT content */
  function parseSRT(text) {
    return parseWebVTTLike(text); // SRT and VTT have similar structure for our purposes
  }

  // ── Video Integration ────────────────────────────────────────────────────

  /** Find the video element in the Prime Video player */
  function getVideoElement() {
    // Prime Video has two player containers:
    // #dv-web-player — the inline/detail page player
    // #dv-web-player-2 — the fullscreen player (actual playback happens here)
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
    // Fallback: any video on the page
    return document.querySelector('#dv-web-player-2 video, #dv-web-player video, video');
  }

  /** Find the currently active cue index for a given time */
  function findActiveCueIndex(timeSec) {
    const { cues } = STATE;
    for (let i = 0; i < cues.length; i++) {
      if (timeSec >= cues[i].start && timeSec < cues[i].end) {
        return i;
      }
    }
    return -1;
  }

  /** Scroll the active cue into view */
  function scrollToCue(index) {
    if (index < 0 || !cueElements[index]) return;
    cueElements[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Update active cue highlighting */
  function updateActiveCue(timeSec) {
    const newIdx = findActiveCueIndex(timeSec);
    if (newIdx === STATE.activeCueIdx) return;

    // Remove old highlight
    if (STATE.activeCueIdx >= 0 && cueElements[STATE.activeCueIdx]) {
      cueElements[STATE.activeCueIdx].classList.remove('lpv-active');
    }

    // Add new highlight
    if (newIdx >= 0 && cueElements[newIdx]) {
      cueElements[newIdx].classList.add('lpv-active');
      // Auto-scroll to keep active cue visible
      const container = panelContent;
      if (container) {
        const el = cueElements[newIdx];
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom > containerRect.bottom - 40 || elRect.top < containerRect.top + 40) {
          scrollToCue(newIdx);
        }
      }
    }

    STATE.activeCueIdx = newIdx;
  }

  /** Seek the video to a specific time */
  function seekTo(timeSec) {
    const video = getVideoElement();
    if (video) {
      video.currentTime = timeSec;
      updateActiveCue(timeSec);
    }
  }

  // ── Subtitle Fetching ────────────────────────────────────────────────────

  /** Fetch and parse a subtitle file */
  async function fetchAndParseSubtitles(url) {
    STATE.loading = true;
    updateStatus('Loading subtitles...');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      let cues;

      // Detect format
      const trimmed = text.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
        cues = parseTTML(text);
      } else if (trimmed.startsWith('WEBVTT')) {
        cues = parseWebVTTLike(text);
      } else if (/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(trimmed)) {
        cues = parseSRT(text);
      } else {
        // Try TTML anyway
        cues = parseTTML(text);
      }

      STATE.cues = cues;
      STATE.subtitleUrl = url;

      if (cues.length === 0) {
        updateStatus('No cues found in subtitle file');
      } else {
        updateStatus(`${cues.length} subtitle entries loaded`);
        renderCues();
        // Auto-open the panel when subtitles are first loaded
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

  // ── Panel UI ─────────────────────────────────────────────────────────────

  function createPanelUI() {
    if (panelRoot) return;

    // Create toggle button
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'lpv-toggle-btn';
    toggleBtn.innerHTML = '📝';
    toggleBtn.title = 'Show transcript (Alt+T)';
    toggleBtn.setAttribute('aria-label', 'Show transcript panel');
    toggleBtn.addEventListener('click', togglePanel);

    // Create panel root
    panelRoot = document.createElement('div');
    panelRoot.id = 'lpv-transcript-panel';
    panelRoot.classList.add('lpv-collapsed');

    // Panel header
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

    // Status bar
    statusEl = document.createElement('div');
    statusEl.id = 'lpv-status';
    statusEl.textContent = 'Waiting for subtitles...';

    // Content area
    panelContent = document.createElement('div');
    panelContent.id = 'lpv-panel-content';

    // Assembly
    panelRoot.appendChild(header);
    panelRoot.appendChild(statusEl);
    panelRoot.appendChild(panelContent);

    document.body.appendChild(panelRoot);
    document.body.appendChild(toggleBtn);

    STATE.panelReady = true;
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

  /** Render cue entries in the panel */
  function renderCues() {
    if (!panelContent) return;
    panelContent.innerHTML = '';
    cueElements = [];

    STATE.cues.forEach((cue, index) => {
      const el = document.createElement('div');
      el.className = 'lpv-cue';
      el.dataset.index = index;

      // Time badge
      const timeBadge = document.createElement('span');
      timeBadge.className = 'lpv-cue-time';
      timeBadge.textContent = formatTime(cue.start);

      // Text
      const textSpan = document.createElement('span');
      textSpan.className = 'lpv-cue-text';
      textSpan.textContent = cue.text;

      el.appendChild(timeBadge);
      el.appendChild(textSpan);

      el.addEventListener('click', () => {
        seekTo(cue.start);
      });

      panelContent.appendChild(el);
      cueElements.push(el);
    });
  }

  /** Format seconds to MM:SS */
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Time Tracking ────────────────────────────────────────────────────────

  let timeUpdateRaf = null;

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
        // Check for both player containers (inline and fullscreen)
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

    // Always respond
    sendResponse({ received: true });
  });

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────

  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+Y or Cmd+Shift+Y to toggle panel
      // (NOT Ctrl+Shift+T — that's Chrome's "Reopen Closed Tab" shortcut)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
        e.preventDefault();
        togglePanel();
        return;
      }

      // Alt+T as an alternative toggle (works on both Mac and Windows)
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        togglePanel();
        return;
      }

      // Only when panel is visible
      if (!STATE.panelVisible) return;

      // Arrow keys to navigate cues
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
    console.log('[PrimeVideoSubs] Content script loaded');

    // Wait for ANY player container (inline or fullscreen)
    const playerEl = await waitForPlayer();
    console.log('[PrimeVideoSubs] Player found');

    // Create panel UI
    createPanelUI();

    // Attach video time tracking
    attachTimeTracking();

    // Setup keyboard shortcuts
    setupKeyboard();

    // Re-check for video element changes (SPA navigation)
    const playerObserver = new MutationObserver(() => {
      const video = getVideoElement();
      if (video && !video._lpvTimeTracking) {
        video._lpvTimeTracking = true;
        attachTimeTracking();
      }
    });

    const playerContainer = document.getElementById('dv-web-player');
    if (playerContainer) {
      playerObserver.observe(playerContainer, { childList: true, subtree: true });
    }

    // Let background know we're ready
    chrome.runtime.sendMessage({ action: 'contentScriptReady' });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
