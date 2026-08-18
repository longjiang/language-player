import { login, getAuthState, logout } from './auth';

document.addEventListener('DOMContentLoaded', function() {
  // ── i18n ─────────────────────────────────────────────────────────────
  /** Runtime messages cache — loaded from _locales/{locale}/messages.json
   *  using the extension's saved L1 (like the sidebar), NOT the browser UI
   *  language. Falls back to chrome.i18n.getMessage(). */
  let runtimeMessages = null;

  function t(key, substitutions) {
    if (runtimeMessages && runtimeMessages[key]) {
      const entry = runtimeMessages[key];
      let msg = entry.message;
      if (substitutions && substitutions.length > 0) {
        const placeholders = entry.placeholders;
        if (placeholders) {
          // Named placeholders: { word: { content: "$1" } } — map names to indices
          for (const [name, config] of Object.entries(placeholders)) {
            const match = config.content?.match(/^\$(\d+)$/);
            if (match) {
              const idx = parseInt(match[1], 10) - 1;
              if (idx >= 0 && idx < substitutions.length) {
                msg = msg.replace(`$${name}$`, substitutions[idx]);
              }
            }
          }
        } else {
          substitutions.forEach((val, i) => {
            msg = msg.replace(`$${i + 1}$`, val);
          });
        }
      }
      if (msg) return msg;
    }
    return substitutions && substitutions.length
      ? chrome.i18n.getMessage(key, ...substitutions)
      : (chrome.i18n.getMessage(key) || key);
  }
  function fillText(sel, key) { const el = document.querySelector(sel); if (el) el.textContent = t(key); }
  function fillHtml(sel, key) { const el = document.querySelector(sel); if (el) el.innerHTML = t(key); }
  function fillPlaceholder(sel, key) { const el = document.querySelector(sel); if (el) el.placeholder = t(key); }

  /** Re-fill all static labels. Called on load and whenever L1 changes. */
  function renderStrings() {
    fillText('#popup-title', 'appName');
    fillText('#lang-title', 'language');
    fillText('#lang-l1-title', 'iSpeak');
    fillText('#lang-l2-title', 'iLearning');
    fillPlaceholder('#lang-l1-search', 'searchLanguages');
    fillPlaceholder('#lang-l2-search', 'searchLanguages');
    fillText('#lang-confirm-btn', 'confirm');
    fillText('#popup-login-prompt', 'popupLoginPrompt');
    fillPlaceholder('#auth-email', 'popupEmailPlaceholder');
    fillPlaceholder('#auth-password', 'popupPasswordPlaceholder');
    fillText('#auth-login-btn', 'popupLoginBtn');
    fillText('#auth-logout-btn', 'popupLogoutBtn');
    fillHtml('#popup-instructions', 'popupInstructions');
    fillHtml('#popup-click-word', 'popupClickWord');
    fillHtml('#popup-save-words', 'popupSaveWords');
    fillHtml('#popup-toggle-shortcut', 'popupToggleShortcut');
    const versionEl = document.querySelector('#popup-version');
    if (versionEl) {
      versionEl.textContent = `${t('versionLabel')} ${chrome.runtime.getManifest().version}`;
    }
    setTranscriptChecking();
    fillHtml('#transcript-hint', 'popupCaptionsHint');
    fillText('#make-text-interactive-label', 'makeTextInteractive');
  }

  /** Grey-out state shown while checking for subtitles (and after locale
   *  changes, until the next status poll resolves). */
  function setTranscriptChecking() {
    const btn = document.querySelector('#transcript-btn');
    if (!btn) return;
    btn.textContent = t('popupChecking');
    btn.className = 'lpv-btn-unavailable';
    btn.disabled = true;
    btn.onclick = null;
  }

  // ── Language picker ──────────────────────────────────────────────────

  /** Bundled by build.mjs from @langplayer/shared (SUPPORTED_L1S/L2S). */
  const LANG_OPTIONS = window.LP_EXTENSION_LANGUAGE_OPTIONS
    || { l1Languages: ['en'], l2Languages: ['en'] };

  /** CSV-style locale (zh-Hans) → Chrome _locales dir (zh_CN). */
  const CSV_TO_CHROME_LOCALE = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW' };

  /** Popular languages shown first in each column — from @langplayer/shared
   *  (ADR-0030 POPULAR_L1S / POPULAR_L2S), bundled by build.mjs. */
  const POPULAR_L1 = LANG_OPTIONS.popularL1s || ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar'];
  const POPULAR_L2 = LANG_OPTIONS.popularL2s || ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'vi', 'ru', 'ar', 'tr', 'it', 'hi', 'yue', 'th', 'id', 'nl', 'he', 'pt'];

  /** { code: { chromeLocale: name } } from dist/lang-names.json */
  let langNames = null;

  let l1Code = 'en';   // saved L1 (persisted in chrome.storage.local)
  let l2Code = 'en';   // saved L2
  let selL1 = 'en';    // selection in the picker (unconfirmed)
  let selL2 = 'en';
  let l1Search = '';
  let l2Search = '';
  let pickerOpen = false;

  function csvToChromeLocale(code) {
    return CSV_TO_CHROME_LOCALE[code] || code;
  }

  /** Language display name resolved against the saved L1 (mirrors content-entry.js). */
  function languageName(code) {
    const entry = (langNames && langNames[code]) || null;
    if (!entry) return (code || '').toUpperCase();
    const chromeLocale = csvToChromeLocale(l1Code);
    if (entry[chromeLocale]) return entry[chromeLocale];
    if (entry[l1Code]) return entry[l1Code];
    const bare = l1Code.replace(/[-_][A-Z]{2}$/i, '');
    if (bare !== l1Code && entry[bare]) return entry[bare];
    if (entry.en) return entry.en;
    return (code || '').toUpperCase();
  }

  async function loadLangNames() {
    try {
      const res = await fetch(chrome.runtime.getURL('dist/lang-names.json'));
      langNames = res.ok ? await res.json() : null;
    } catch {
      langNames = null;
    }
  }

  async function loadLocaleMessages() {
    try {
      const url = chrome.runtime.getURL(`_locales/${csvToChromeLocale(l1Code)}/messages.json`);
      const res = await fetch(url);
      runtimeMessages = res.ok ? await res.json() : null;
    } catch {
      runtimeMessages = null;
    }
  }

  function getFilteredL1() {
    const q = l1Search.toLowerCase().trim();
    const all = LANG_OPTIONS.l1Languages;
    if (!q) {
      return {
        popular: POPULAR_L1.filter(c => all.includes(c)),
        rest: all.filter(c => !POPULAR_L1.includes(c)),
        searching: false,
      };
    }
    return {
      popular: all.filter(c => languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q)),
      rest: [],
      searching: true,
    };
  }

  function getFilteredL2() {
    const q = l2Search.toLowerCase().trim();
    const all = LANG_OPTIONS.l2Languages;
    if (!q) {
      return {
        popular: POPULAR_L2.filter(c => all.includes(c)),
        rest: all.filter(c => !POPULAR_L2.includes(c)),
        searching: false,
      };
    }
    return {
      popular: all.filter(c => languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q)),
      rest: [],
      searching: true,
    };
  }

  function selectLang(side, code) {
    if (side === 'l1') selL1 = code;
    else selL2 = code;
    renderLanguageUI();
  }

  function renderLangList(side) {
    const isL1 = side === 'l1';
    const { popular, rest, searching } = isL1 ? getFilteredL1() : getFilteredL2();
    const listEl = document.getElementById(isL1 ? 'lang-l1-list' : 'lang-l2-list');
    const selected = isL1 ? selL1 : selL2;
    listEl.textContent = '';

    const makeItem = (code) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lpv-modal-item' + (selected === code ? ' lpv-modal-item-selected' : '');
      btn.addEventListener('click', () => selectLang(side, code));
      const nameSpan = document.createElement('span');
      nameSpan.textContent = languageName(code);
      const codeSpan = document.createElement('span');
      codeSpan.className = 'lpv-modal-item-code';
      codeSpan.textContent = code.toUpperCase();
      btn.appendChild(nameSpan);
      btn.appendChild(codeSpan);
      return btn;
    };

    if (popular.length > 0) {
      if (!searching) {
        const label = document.createElement('div');
        label.className = 'lpv-modal-list-label';
        label.textContent = t('popularLanguages');
        listEl.appendChild(label);
      }
      popular.forEach(code => listEl.appendChild(makeItem(code)));
    }
    if (rest.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'lpv-modal-divider';
      listEl.appendChild(divider);
      const label = document.createElement('div');
      label.className = 'lpv-modal-list-label';
      label.textContent = t('allLanguages');
      listEl.appendChild(label);
      rest.forEach(code => listEl.appendChild(makeItem(code)));
    }
  }

  function renderLanguageUI() {
    const summary = `${languageName(selL1)} → ${languageName(selL2)}`;
    const summaryEl = document.getElementById('lang-summary');
    if (summaryEl) summaryEl.textContent = summary;
    const selectionEl = document.getElementById('lang-selection');
    if (selectionEl) selectionEl.textContent = summary;
    renderLangList('l1');
    renderLangList('l2');
  }

  function setPickerOpen(open) {
    pickerOpen = open;
    document.getElementById('lang-picker').classList.toggle('hidden', !pickerOpen);
    const toggleBtn = document.getElementById('lang-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = pickerOpen ? t('close') : t('changeLanguage');
    if (!pickerOpen) {
      // Reset search state when collapsed (the sidebar modal unmounted on close)
      l1Search = '';
      l2Search = '';
      const s1 = document.getElementById('lang-l1-search');
      const s2 = document.getElementById('lang-l2-search');
      if (s1) s1.value = '';
      if (s2) s2.value = '';
      renderLanguageUI();
    }
  }

  async function applyLanguageChange() {
    const l1Changed = selL1 !== l1Code;
    const l2Changed = selL2 !== l2Code;
    if (!l1Changed && !l2Changed) {
      setPickerOpen(false);
      return;
    }

    l1Code = selL1;
    l2Code = selL2;

    // Persist (single source of truth for both popup and content script)
    try {
      await chrome.storage.local.set({ l1Language: l1Code, l2Language: l2Code });
    } catch {}

    // Notify the active tab so the panel applies the change immediately
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { action: 'changeLanguage', l1: l1Code, l2: l2Code })
          .catch(() => {});
      }
    } catch {}

    // Re-render the popup in the new L1
    await loadLocaleMessages();
    renderStrings();
    renderLanguageUI();
    setPickerOpen(false);
    checkTranscriptStatus(); // refresh button labels/warning in the new L1
  }

  async function initLanguage() {
    // Render labels immediately (chrome.i18n fallback), then re-render in the
    // saved L1 once locale messages + language names have loaded.
    renderStrings();
    const stored = await chrome.storage.local.get(['l1Language', 'l2Language']);
    if (stored.l1Language && LANG_OPTIONS.l1Languages.includes(stored.l1Language)) {
      l1Code = stored.l1Language;
    }
    if (stored.l2Language && LANG_OPTIONS.l2Languages.includes(stored.l2Language)) {
      l2Code = stored.l2Language;
    }
    selL1 = l1Code;
    selL2 = l2Code;
    await Promise.all([loadLangNames(), loadLocaleMessages()]);
    renderStrings();
    renderLanguageUI();
    setPickerOpen(false);
  }

  document.getElementById('lang-toggle-btn').addEventListener('click', () => {
    setPickerOpen(!pickerOpen);
  });
  document.getElementById('lang-confirm-btn').addEventListener('click', () => {
    applyLanguageChange();
  });
  document.getElementById('lang-l1-search').addEventListener('input', (e) => {
    l1Search = e.target.value;
    renderLangList('l1');
  });
  document.getElementById('lang-l2-search').addEventListener('input', (e) => {
    l2Search = e.target.value;
    renderLangList('l2');
  });

  initLanguage();

  // ── Auth ──────────────────────────────────────────────────────────────
  const authSection = document.getElementById('auth-section');
  const loggedOutDiv = document.getElementById('auth-logged-out');
  const loggedInDiv = document.getElementById('auth-logged-in');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authLoginBtn = document.getElementById('auth-login-btn');
  const authLogoutBtn = document.getElementById('auth-logout-btn');
  const authError = document.getElementById('auth-error');
  const authUser = document.getElementById('auth-user');

  async function checkAuth() {
    let auth = null;
    try {
      auth = await getAuthState();
    } catch {
      auth = null;
    }
    if (auth && auth.token) {
      loggedOutDiv.classList.add('hidden');
      loggedInDiv.classList.remove('hidden');
      authUser.textContent = auth.email;
    } else {
      loggedOutDiv.classList.remove('hidden');
      loggedInDiv.classList.add('hidden');
    }
  }

  authLoginBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return;

    authLoginBtn.disabled = true;
    authError.classList.add('hidden');

    try {
      await login(email, password);
      checkAuth();
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    } finally {
      authLoginBtn.disabled = false;
    }
  });

  authLogoutBtn.addEventListener('click', async () => {
    await logout();
    checkAuth();
  });

  // Allow Enter key to submit
  authPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authLoginBtn.click();
  });

  checkAuth();

  // ── Transcript Toggle ─────────────────────────────────────────────────
  const transcriptBtn = document.getElementById('transcript-btn');
  const transcriptHint = document.getElementById('transcript-hint');
  const openInWebBtn = document.getElementById('open-in-web-btn');
  const openWebWarn = document.getElementById('open-web-warn');
  const makeTextRow = document.getElementById('make-text-interactive-row');
  const makeTextToggle = document.getElementById('make-text-interactive-toggle');
  const WEB_APP_URL = 'https://language-player.netlify.app';

  /** Supported video domains where the content script runs
   *  (mirrors manifest.json content_scripts matches). */
  const VIDEO_HOST_RE = /(^|\.)(netflix\.com|primevideo\.com|amazon\.(com|co\.uk|de|co\.jp)|youtube\.com|disneyplus\.com|hulu\.com|max\.com|hbonow\.com|hbomax\.com)$/i;

  /** Language Player's own web assets — never offer page tokenization there. */
  const OWN_HOST_RE = /(^|\.)(languageplayer\.io|language-player\.netlify\.app)$/i;

  function isVideoDomain(tabUrl) {
    try {
      return VIDEO_HOST_RE.test(new URL(tabUrl).hostname);
    } catch {
      return false;
    }
  }

  function isOwnDomain(tabUrl) {
    try {
      return OWN_HOST_RE.test(new URL(tabUrl).hostname);
    } catch {
      return false;
    }
  }

  function isLocalhost(tabUrl) {
    try {
      const host = new URL(tabUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
    } catch {
      return false;
    }
  }

  /** Strip BCP 47 subtags down to the primary language code ("zh-Hans" → "zh"). */
  function baseCode(code) {
    return (code || '').split('-')[0];
  }

  /** Extract a YouTube video ID from a tab URL (mirrors content-entry.js). */
  function getYouTubeVideoId(tabUrl) {
    try {
      const u = new URL(tabUrl);
      const host = u.hostname;
      if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null;
      return u.searchParams.get('v') || null;
    } catch {
      return null;
    }
  }

  /** Update the "Open in Language Player" button:
   *  - non-video domains → "Read in Language Player" (reader page with ?url=current)
   *  - YouTube video with subtitles → "Watch in Language Player" (watch page)
   *  - anything else → hidden (subtitle sites already have the in-page panel)
   *  Warns when the page's detected L2 differs from the user's saved L2. */
  function updateOpenInWebBtn(tabUrl, status) {
    if (!tabUrl || !/^https?:/i.test(tabUrl) || isOwnDomain(tabUrl) || isLocalhost(tabUrl)) {
      openInWebBtn.classList.add('hidden');
      openWebWarn.classList.add('hidden');
      return;
    }

    const videoId = getYouTubeVideoId(tabUrl);
    const subsAvailable = !!(status && status.cuesCount > 0);
    const base = `${WEB_APP_URL}/${encodeURIComponent(l1Code)}/${encodeURIComponent(l2Code)}`;

    if (!isVideoDomain(tabUrl)) {
      openInWebBtn.dataset.url = `${base}/web-reader?url=${encodeURIComponent(tabUrl)}`;
      openInWebBtn.textContent = t('readInLanguagePlayer');
      openInWebBtn.classList.remove('hidden');
    } else if (videoId && subsAvailable) {
      openInWebBtn.dataset.url = `${base}/watch/${encodeURIComponent(videoId)}`;
      openInWebBtn.textContent = t('watchInLanguagePlayer');
      openInWebBtn.classList.remove('hidden');
    } else {
      openInWebBtn.classList.add('hidden');
    }

    const detectedL2 = status && status.detectedSubLang;
    const mismatch = !openInWebBtn.classList.contains('hidden') && detectedL2 && baseCode(detectedL2) !== baseCode(l2Code);
    if (mismatch) {
      openWebWarn.textContent = t('l2Mismatch', [languageName(detectedL2), languageName(l2Code)]);
      openWebWarn.classList.remove('hidden');
    } else {
      openWebWarn.classList.add('hidden');
    }
  }

  openInWebBtn.addEventListener('click', () => {
    const url = openInWebBtn.dataset.url;
    if (!url) return;
    chrome.tabs.create({ url });
    window.close();
  });

  /** Show/hide "Make Text on Page Interactive" — only on pages where the
   *  "Read in Language Player" reader button is visible (non-video domains). */
  function updateMakeTextInteractiveBtn(tabUrl) {
    if (!tabUrl || !/^https?:/i.test(tabUrl) || isVideoDomain(tabUrl) || isOwnDomain(tabUrl) || isLocalhost(tabUrl)) {
      makeTextRow.classList.add('hidden');
      return;
    }
    chrome.storage.sync.get('pageTokenizationEnabled', (prefs) => {
      makeTextToggle.checked = !!prefs.pageTokenizationEnabled;
      makeTextRow.classList.remove('hidden');
    });
  }

  makeTextToggle.addEventListener('change', async () => {
    const next = makeTextToggle.checked;
    await chrome.storage.sync.set({ pageTokenizationEnabled: next });

    let tab = null;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: next ? 'pageTokenizationOn' : 'pageTokenizationOff',
        }).catch(() => {});

        if (next) {
          // This popup change is a user gesture — open the native side panel
          // so the page reader is visible right away.
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        }
      }
    } catch {}

    updateMakeTextInteractiveBtn(tab?.url || null);
  });

  async function checkTranscriptStatus() {
    let tab = null;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {}

    if (!tab?.id) {
      showNoTranscript();
      updateOpenInWebBtn(null);
      updateMakeTextInteractiveBtn(null);
      return;
    }

    // Non-video domains: hide the transcript UI entirely and skip status
    // detecting — the content script doesn't run there anyway.
    if (!isVideoDomain(tab.url || '')) {
      transcriptBtn.classList.add('hidden');
      transcriptHint.classList.add('hidden');
      updateOpenInWebBtn(tab.url || null, null);
      updateMakeTextInteractiveBtn(tab.url || null);
      return;
    }

    // Video domain: show the greyed-out "Checking…" state while querying the
    // content script.
    transcriptBtn.classList.remove('hidden');
    setTranscriptChecking();

    // The content script may not be loaded on this page — still show the
    // "Read in Language Player" button using the best status we have.
    let res = null;
    try {
      res = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscriptStatus' });
    } catch {
      // Content script not loaded on this page
    }
    updateOpenInWebBtn(tab.url || null, res || null);
    updateMakeTextInteractiveBtn(null);

    if (res?.cuesCount > 0) {
      transcriptHint.classList.add('hidden');
      transcriptBtn.classList.remove('hidden');
      transcriptBtn.textContent = t('popupShowTranscript');
      transcriptBtn.className = 'lpv-btn-available';
      transcriptBtn.disabled = false;
      transcriptBtn.onclick = () => {
        // Open the native side panel — this popup click is a user gesture
        // (chrome.sidePanel.open() requires one).
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        window.close();
      };
    } else {
      showNoTranscript();
    }
  }

  function showNoTranscript() {
    transcriptBtn.classList.remove('hidden');
    transcriptBtn.textContent = t('popupNoTranscript');
    transcriptBtn.className = 'lpv-btn-unavailable';
    transcriptBtn.disabled = true;
    transcriptHint.classList.remove('hidden');
  }

  // Check immediately and poll
  checkTranscriptStatus();
  setInterval(checkTranscriptStatus, 1500);
});
