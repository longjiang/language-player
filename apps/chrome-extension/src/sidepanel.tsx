/**
 * Side panel host — renders the Language Player panel inside the native
 * Chrome side panel (chrome.sidePanel API).
 *
 * The video transcript (TranscriptAppInner) and page reader (PagePanel)
 * React UIs previously rendered inside the page DOM via content scripts.
 * They now render here. Content scripts push state through the background
 * (relayed over a runtime port); the host pulls the active tab's current
 * state on open/tab-switch and sends seek / follow-link / toggle commands
 * back to the content script.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { SavedWordsProvider } from './components/SavedWordsProvider';
import { TranscriptAppInner, PagePanel, type PageLookupDetail } from './transcript-app';
import { t, setLocale, log } from './i18n';
import langNames from '../dist/lang-names.json';

const WEB_APP_URL = 'https://language-player.netlify.app';

/** CSV-style locale → Chrome _locales/ directory name (mirrors popup.js). */
const CSV_TO_CHROME_LOCALE = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW' };

function languageName(code, l1Code) {
  const entry = (langNames && langNames[code]) || null;
  if (!entry) return (code || '').toUpperCase();
  const chromeLocale = CSV_TO_CHROME_LOCALE[l1Code] || l1Code;
  if (entry[chromeLocale]) return entry[chromeLocale];
  if (entry[l1Code]) return entry[l1Code];
  const bare = l1Code.replace(/[-_][A-Z]{2}$/i, '');
  if (bare !== l1Code && entry[bare]) return entry[bare];
  if (entry.en) return entry.en;
  return (code || '').toUpperCase();
}

interface VideoPanelState {
  mode: 'video';
  cues: Array<{ start: number; end: number; text: string }>;
  activeCueIdx: number;
  l2Code: string;
  l1Code: string;
  videoTitle?: string;
  pageUrl?: string;
  loadingL2?: string;
  localeVersion?: number;
  webUrl?: { url: string; labelKey: string } | null;
  mismatch?: { detected: string; saved: string } | null;
}

interface PagePanelState {
  mode: 'page';
  l1Code: string;
  l2Code: string;
  pageUrl: string;
  lookup?: PageLookupDetail | null;
  /** Page-declared language ≠ saved L2 (page reader warning, web parity of
   *  the video-mode mismatch). */
  mismatch?: { detected: string; saved: string } | null;
}

function SidePanelApp() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [mode, setMode] = useState<'video' | 'page' | null>(null);
  const [videoState, setVideoState] = useState<VideoPanelState | null>(null);
  const [pageState, setPageState] = useState<PagePanelState | null>(null);
  const [lookup, setLookup] = useState<PageLookupDetail | null>(null);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [localeVersion, setLocaleVersion] = useState(0);
  const [l1Code, setL1Code] = useState('en');

  const tabIdRef = useRef<number | null>(null);
  tabIdRef.current = tabId;

  const getActiveTabId = useCallback(async (): Promise<number | null> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  /** Pull the current panel state from a tab's content script. */
  const pullState = useCallback(async (tid: number | null) => {
    setMode(null);
    setLookup(null);
    if (!tid) return;
    try {
      const res: any = await chrome.tabs.sendMessage(tid, { action: 'getPanelState' });
      if (res?.state?.mode === 'video') {
        setVideoState(res.state);
        setMode('video');
        setMismatchDismissed(false);
      } else if (res?.state?.mode === 'page') {
        setPageState(res.state);
        setLookup(res.state.lookup || null);
        setMode('page');
      }
    } catch {
      // No content script (or not ready yet) — the empty state shows until a
      // content script pushes its first panelState/pageModeState.
    }
  }, []);

  // ── Active tab tracking ──
  useEffect(() => {
    const refresh = async (tid?: number) => {
      const target = tid ?? (await getActiveTabId());
      setTabId(target);
      await pullState(target);
    };
    refresh();

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      setTabId(info.tabId);
      pullState(info.tabId);
    };
    const onUpdated = (tid: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete' && tid === tabIdRef.current) {
        pullState(tid);
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [getActiveTabId, pullState]);

  // ── Port to background: receives content-script state pushes ──
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'lpv-sidepanel' });
    port.onMessage.addListener((msg: any) => {
      if (!msg || msg.tabId !== tabIdRef.current) return;
      if (msg.action === 'panelState') {
        setVideoState(msg.state);
        setMode('video');
        setMismatchDismissed(false);
      } else if (msg.action === 'pageModeState') {
        setPageState(msg.state);
        setMode('page');
        setMismatchDismissed(false);
        if (msg.state?.lookup) setLookup(msg.state.lookup);
      } else if (msg.action === 'pageLookup') {
        setLookup(msg.payload);
      }
    });
    return () => {
      port.disconnect();
    };
  }, []);

  // ── Locale ──
  useEffect(() => {
    (async () => {
      const { l1Language } = await chrome.storage.local.get('l1Language');
      const l1 = l1Language || 'en';
      setL1Code(l1);
      await setLocale(l1);
      setLocaleVersion((v) => v + 1);
    })();
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === 'local' && changes.l1Language) {
        const next = changes.l1Language.newValue || 'en';
        setL1Code(next);
        setLocale(next).then(() => setLocaleVersion((v) => v + 1));
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const sendToTab = useCallback((action: string, payload: object = {}) => {
    const tid = tabIdRef.current;
    if (!tid) return;
    chrome.tabs.sendMessage(tid, { action, ...payload }).catch(() => {});
  }, []);

  const handleSeek = useCallback((timeSec: number) => {
    sendToTab('panelSeek', { timeSec });
  }, [sendToTab]);

  const handleFollowLink = useCallback((href: string) => {
    sendToTab('pageFollowLink', { href });
  }, [sendToTab]);

  const closePanel = useCallback(async () => {
    if (mode === 'page') {
      // Closing the panel from page mode disables page tokenization, exactly
      // like the old in-page close button (SPEC-075).
      try {
        chrome.storage.sync.set({ pageTokenizationEnabled: false });
      } catch {}
      sendToTab('pageTokenizationOff');
    }
    try {
      // Chrome 141+ closes programmatically. The panel is a GLOBAL side panel
      // (manifest side_panel.default_path, no per-tab setOptions), so
      // close({ tabId }) rejects on Chrome 145+ when only the global panel is
      // open. Pass windowId instead — that closes the global panel in the
      // hosting window on every Chrome 141+ version.
      if (chrome.sidePanel?.close) {
        const win = await chrome.windows.getCurrent();
        if (win?.id != null) {
          await chrome.sidePanel.close({ windowId: win.id });
        }
      }
    } catch {}
  }, [mode, sendToTab]);

  const switchL2 = useCallback(() => {
    const mismatch =
      mode === 'video' ? videoState?.mismatch : mode === 'page' ? pageState?.mismatch : null;
    if (!mismatch) return;
    const l1 = mode === 'video' ? videoState?.l1Code : pageState?.l1Code;
    sendToTab('changeLanguage', { l1: l1 ?? 'en', l2: mismatch.detected });
    setMismatchDismissed(true);
  }, [videoState, pageState, mode, sendToTab]);

  // Header "open in web app" button: YouTube watch page (video) or web-reader (page).
  const webBtn =
    mode === 'video' && videoState?.webUrl
      ? videoState.webUrl
      : mode === 'page' && pageState
        ? {
            url: `${WEB_APP_URL}/${encodeURIComponent(pageState.l1Code)}/${encodeURIComponent(pageState.l2Code)}/web-reader?url=${encodeURIComponent(pageState.pageUrl)}`,
            labelKey: 'readInLanguagePlayer',
          }
        : null;

  const mismatch =
    (mode === 'video' && videoState?.mismatch) || (mode === 'page' && pageState?.mismatch) || null;
  const mismatchShown = mismatch && !mismatchDismissed ? mismatch : null;

  let content;
  if (mode === 'video' && videoState) {
    content = (
      <SavedWordsProvider l2Code={videoState.l2Code}>
        <TranscriptAppInner
          cues={videoState.cues}
          activeCueIdx={videoState.activeCueIdx}
          l2Code={videoState.l2Code}
          l1Code={videoState.l1Code}
          onSeekTo={handleSeek}
          loadingL2={videoState.loadingL2}
          localeVersion={localeVersion + (videoState.localeVersion ?? 0)}
          videoTitle={videoState.videoTitle}
          pageUrl={videoState.pageUrl}
        />
      </SavedWordsProvider>
    );
  } else if (mode === 'page' && pageState) {
    content = (
      <SavedWordsProvider l2Code={pageState.l2Code}>
        <PagePanel
          l1Code={pageState.l1Code}
          l2Code={pageState.l2Code}
          pageUrl={pageState.pageUrl}
          lookup={lookup}
          onFollowLink={handleFollowLink}
        />
      </SavedWordsProvider>
    );
  } else {
    content = (
      <div className="lpv-page-panel-scroll">
        <div className="lpv-page-empty">{t('startPlaying')}</div>
      </div>
    );
  }

  return (
    <div
      id="lpv-transcript-panel"
      className={mode === 'page' ? 'lpv-page-panel' : ''}
    >
      <div id="lpv-panel-header">
        <span id="lpv-panel-title">
          <img
            id="lpv-panel-logo"
            src={chrome.runtime.getURL('src/language-player-logo-64.png')}
            alt=""
            width="24"
            height="24"
          />
        </span>
        <div id="lpv-header-right">
          {webBtn && (
            <a
              id="lpv-open-web-btn"
              className="lpv-visible"
              href={webBtn.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(webBtn.labelKey)}
            </a>
          )}
          <button id="lpv-close-btn" title={t('closePanel')} onClick={closePanel}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>

      {mismatchShown && (
        <div id="lpv-mismatch-banner" style={{ display: 'block' }}>
          <div className="lpv-mismatch-content">
            <span className="lpv-mismatch-icon">⚠️</span>
            <span className="lpv-mismatch-text">
              {t('l2Mismatch', [languageName(mismatchShown.detected, l1Code), languageName(mismatchShown.saved, l1Code)])}
            </span>
          </div>
          <div className="lpv-mismatch-actions">
            <button className="lpv-mismatch-switch-btn" onClick={switchL2}>
              {t('l2MismatchSwitch', [languageName(mismatchShown.detected, l1Code)])}
            </button>
            <button className="lpv-mismatch-dismiss-btn" onClick={() => setMismatchDismissed(true)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      <div id="lpv-panel-content">{content}</div>
    </div>
  );
}

const container = document.getElementById('lpv-side-panel-root');
if (container) {
  createRoot(container).render(<SidePanelApp />);
}
log('Side panel host loaded');
