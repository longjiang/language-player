document.addEventListener('DOMContentLoaded', function() {
  // ── i18n ─────────────────────────────────────────────────────────────
  /** Runtime messages cache — loaded from _locales/{locale}/messages.json
   *  using the extension's saved L1 (like the sidebar), NOT the browser UI
   *  language. Falls back to chrome.i18n.getMessage(). */
  let runtimeMessages = null;

  function t(key) {
    if (runtimeMessages && runtimeMessages[key]) return runtimeMessages[key].message;
    return chrome.i18n.getMessage(key) || key;
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
    fillText('#transcript-btn', 'popupChecking');
    fillHtml('#transcript-hint', 'popupCaptionsHint');
  }

  // ── Language picker ──────────────────────────────────────────────────

  /** Bundled by build.mjs from @langplayer/shared (SUPPORTED_L1S/L2S). */
  const LANG_OPTIONS = window.LP_EXTENSION_LANGUAGE_OPTIONS
    || { l1Languages: ['en'], l2Languages: ['en'] };

  /** CSV-style locale (zh-Hans) → Chrome _locales dir (zh_CN). */
  const CSV_TO_CHROME_LOCALE = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW' };

  /** Popular languages shown first in each column (matches the sidebar modal). */
  const POPULAR_L1 = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'hi'];
  const POPULAR_L2 = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi'];

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
  const STORAGE_KEY = 'lpv_auth';
  const DIRECTUS_URL = 'https://directusvps.zerotohero.ca/zerotohero';

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
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const auth = stored[STORAGE_KEY];
    if (auth && auth.expires > Date.now() + 5 * 60 * 1000) {
      loggedOutDiv.classList.add('hidden');
      loggedInDiv.classList.remove('hidden');
      authUser.textContent = auth.email;
    } else {
      loggedOutDiv.classList.remove('hidden');
      loggedInDiv.classList.add('hidden');
      if (auth) await chrome.storage.local.remove(STORAGE_KEY);
    }
  }

  authLoginBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return;

    authLoginBtn.disabled = true;
    authError.classList.add('hidden');

    try {
      const res = await fetch(`${DIRECTUS_URL}/auth/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.errors?.[0]?.message || err.message || `Login failed (${res.status})`);
      }
      const data = await res.json();
      const token = data.data?.token;
      if (!token) throw new Error('No token in response');

      const payload = JSON.parse(atob(token.split('.')[1]));
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          token,
          email,
          userId: String(payload.id),
          expires: (payload.exp || 0) * 1000,
        }
      });
      checkAuth();
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    } finally {
      authLoginBtn.disabled = false;
    }
  });

  authLogoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
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

  async function checkTranscriptStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { showNoTranscript(); return; }

      const res = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscriptStatus' });
      if (res?.cuesCount > 0) {
        const isOpen = !!res.panelVisible;
        transcriptBtn.textContent = isOpen ? t('hideTranscript') : t('popupShowTranscript');
        transcriptBtn.className = 'lpv-btn-available';
        transcriptBtn.disabled = false;
        transcriptBtn.onclick = () => {
          chrome.tabs.sendMessage(tab.id, { action: isOpen ? 'hideTranscript' : 'showTranscript' });
          window.close();
        };
        transcriptHint.classList.add('hidden');
      } else {
        showNoTranscript();
      }
    } catch {
      // Content script not loaded on this page
      showNoTranscript();
    }
  }

  function showNoTranscript() {
    transcriptBtn.textContent = t('popupNoTranscript');
    transcriptBtn.className = 'lpv-btn-unavailable';
    transcriptBtn.disabled = true;
    transcriptHint.classList.remove('hidden');
  }

  // Check immediately and poll
  checkTranscriptStatus();
  setInterval(checkTranscriptStatus, 1500);
});
