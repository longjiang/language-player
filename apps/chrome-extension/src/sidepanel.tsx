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
import type { AuthState } from './auth';
import { SavedWordsProvider } from './components/SavedWordsProvider';
import { TranscriptAppInner, type DictionaryModalRequest, type LineExplanationRequest, type PageLookupDetail } from './transcript-app';
import { PageTranslationPanel } from './components/PageTranslationPanel';
import { LanguagePicker } from './components/LanguagePicker';
import { UserMenu } from './components/UserMenu';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { t, setLocale, log } from './i18n';
import { languageName } from './language-names';

type SidePanelTab = 'subtitles' | 'page-translation';
type Theme = 'light' | 'dark' | 'system';
type SubtitleStatus = 'idle' | 'detecting' | 'ready' | 'empty' | 'error';

type PageModal =
  | { kind: 'language'; l1Code: string; l2Code: string }
  | { kind: 'settings'; l2Code: string }
  | { kind: 'help' }
  | { kind: 'about' }
  | { kind: 'login' }
  | ({ kind: 'dictionary' } & DictionaryModalRequest)
  | { kind: 'line-explanation'; request: LineExplanationRequest }
  | { kind: 'account'; auth: AuthState; l1Code: string; l2Code: string };

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const isDark = theme === 'dark'
    || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  root.dataset.theme = theme;
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
  subtitleStatus?: SubtitleStatus;
  subtitleError?: string | null;
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
  pageTranslationStatus?: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  pageTranslationError?: string | null;
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
  const [l2Code, setL2Code] = useState('en');
  const [selectedTab, setSelectedTab] = useState<SidePanelTab>('subtitles');
  const [theme, setTheme] = useState<Theme>('system');
  const [subtitleRequesting, setSubtitleRequesting] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const pageModalEventRef = useRef<(event: any) => void>(() => {});

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

  const selectTab = useCallback((next: SidePanelTab) => {
    setSelectedTab(next);
    chrome.storage.local.set({ sidePanelTab: next }).catch(() => {});
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
      } else if (msg.action === 'pageModalEvent') {
        pageModalEventRef.current(msg.event);
      }
    });
    return () => {
      port.disconnect();
    };
  }, []);

  // Keep the System theme in sync while the side panel remains open.
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [theme]);

  // ── Locale ──
  useEffect(() => {
    (async () => {
      const { l1Language, l2Language, sidePanelTab, theme: savedTheme } = await chrome.storage.local.get([
        'l1Language',
        'l2Language',
        'sidePanelTab',
        'theme',
      ]);
      const l1 = l1Language || 'en';
      setL1Code(l1);
      setL2Code(l2Language || 'en');
      if (sidePanelTab === 'subtitles' || sidePanelTab === 'page-translation') {
        setSelectedTab(sidePanelTab);
      }
      const nextTheme: Theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system';
      setTheme(nextTheme);
      applyTheme(nextTheme);
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
      if (area === 'local' && changes.l2Language) {
        setL2Code(changes.l2Language.newValue || 'en');
      }
      if (area === 'local' && changes.sidePanelTab) {
        const next = changes.sidePanelTab.newValue;
        if (next === 'subtitles' || next === 'page-translation') setSelectedTab(next);
      }
      if (area === 'local' && changes.theme) {
        const next: Theme = changes.theme.newValue === 'light' || changes.theme.newValue === 'dark'
          ? changes.theme.newValue
          : 'system';
        setTheme(next);
        applyTheme(next);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const sendToTab = useCallback((action: string, payload: object = {}) => {
    const tid = tabIdRef.current;
    if (!tid) return Promise.resolve(undefined);
    return chrome.tabs.sendMessage(tid, { action, ...payload }).catch(() => undefined);
  }, []);

  const openPageModal = useCallback((pageModal: PageModal) => {
    sendToTab('openPageModal', { modal: pageModal, theme });
  }, [sendToTab, theme]);

  const requestSubtitleDetection = useCallback((retry = false) => {
    if (!tabId || mode !== 'video') return;
    setSubtitleRequesting(true);
    sendToTab('requestSubtitleDetection', { retry }).finally(() => setSubtitleRequesting(false));
  }, [mode, sendToTab, tabId]);

  const subtitlesAvailable = mode === 'video' || !!videoState;
  const activeTab: SidePanelTab = selectedTab === 'subtitles' && subtitlesAvailable
    ? 'subtitles'
    : 'page-translation';

  useEffect(() => {
    if (activeTab !== 'subtitles' || !tabId) return;
    requestSubtitleDetection();
  }, [activeTab, requestSubtitleDetection, tabId]);

  useEffect(() => {
    if (!tabId) return;
    sendToTab('pageTranslationVisibility', {
      open: activeTab === 'page-translation',
    });
  }, [activeTab, sendToTab, tabId]);

  const handleSeek = useCallback((timeSec: number) => {
    sendToTab('panelSeek', { timeSec });
  }, [sendToTab]);

  const closePanel = useCallback(async () => {
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

  const mismatch =
    (mode === 'video' && videoState?.mismatch) || (mode === 'page' && pageState?.mismatch) || null;
  const mismatchShown = mismatch && !mismatchDismissed ? mismatch : null;

  const subtitleStatus = videoState?.subtitleStatus
    || (videoState?.cues?.length ? 'ready' : 'idle');
  const subtitleContent = mode === 'video' && videoState && subtitleStatus === 'ready' ? (
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
          onDictionaryOpen={(request: DictionaryModalRequest | null) => {
            if (request) openPageModal({ kind: 'dictionary', ...request });
          }}
          onLineExplainOpen={(request: LineExplanationRequest | null) => {
            if (request) openPageModal({ kind: 'line-explanation', request });
          }}
        />
      </SavedWordsProvider>
    ) : subtitleStatus === 'detecting' || subtitleRequesting ? (
      <div className="lpv-ui-empty-state" role="status" aria-live="polite">
        <span className="lpv-ui-spinner" aria-hidden="true" />
        <p>{t('detectingSubtitles')}</p>
      </div>
    ) : subtitleStatus === 'error' ? (
      <div className="lpv-ui-empty-state" role="alert">
        <p>{videoState?.subtitleError || t('failedToLoadSubtitles')}</p>
        <Button variant="outline" size="sm" onClick={() => requestSubtitleDetection(true)}>
          {t('retry')}
        </Button>
      </div>
    ) : subtitleStatus === 'empty' || mode === 'video' ? (
      <div className="lpv-ui-empty-state" role="status" aria-live="polite">
        <p>{t('noSubtitlesFound')}</p>
        <Button variant="outline" size="sm" onClick={() => requestSubtitleDetection(true)}>
          {t('retry')}
        </Button>
      </div>
    ) : (
      <div className="lpv-ui-empty-state">
        <p>{t('startPlaying')}</p>
      </div>
    );

  const pageTranslationContent = activeTab === 'page-translation' ? (
      <PageTranslationPanel
        tabId={tabId}
        l1Code={pageState?.l1Code || l1Code}
        l2Code={pageState?.l2Code || l2Code}
        pageUrl={pageState?.pageUrl}
        lookup={lookup}
      />
  ) : null;

  const currentL2Code = mode === 'video' ? videoState?.l2Code ?? l2Code : mode === 'page' ? pageState?.l2Code ?? l2Code : l2Code;

  const handleLanguageConfirm = useCallback(async (nextL1: string, nextL2: string, traditional: boolean) => {
    setLanguagePickerOpen(false);
    await chrome.storage.local.set({ l1Language: nextL1, l2Language: nextL2, useTraditional: traditional });
    if (nextL1 !== l1Code) {
      setL1Code(nextL1);
      await setLocale(nextL1);
      setLocaleVersion((version) => version + 1);
    }
    setL2Code(nextL2);
    sendToTab('changeLanguage', { l1: nextL1, l2: nextL2 });
  }, [l1Code, sendToTab]);

  const handleThemeChange = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  pageModalEventRef.current = (event: any) => {
    if (!event?.action) return;
    if (event.action === 'languageConfirm') {
      handleLanguageConfirm(event.l1Code, event.l2Code, event.traditional === true).catch(() => {});
    } else if (event.action === 'themeChange' && (event.theme === 'light' || event.theme === 'dark' || event.theme === 'system')) {
      handleThemeChange(event.theme);
    }
  };

  return (
    <div className="lpv-app-shell" data-theme={theme}>
      <header className="lpv-app-topbar">
        <div className="lpv-app-brand">
          <img
            className="lpv-app-logo"
            src={chrome.runtime.getURL('src/language-player-logo-64.png')}
            alt=""
            width="24"
            height="24"
          />
          <span className="lpv-app-wordmark">Language Player</span>
        </div>
        <div className="lpv-app-topbar-actions">
          <Button
            variant="ghost"
            size="sm"
            className="lpv-language-trigger"
            aria-haspopup="dialog"
            onClick={() => setLanguagePickerOpen(true)}
          >
            {languageName(currentL2Code, l1Code)}
            <span aria-hidden="true">⌄</span>
          </Button>
          <UserMenu
            onSettings={() => openPageModal({ kind: 'settings', l2Code: currentL2Code })}
            onHelp={() => openPageModal({ kind: 'help' })}
            onAbout={() => openPageModal({ kind: 'about' })}
            onLogin={() => openPageModal({ kind: 'login' })}
            onAccount={(auth) => openPageModal({ kind: 'account', auth, l1Code, l2Code: currentL2Code })}
          />
          <Button variant="ghost" size="icon" aria-label={t('closePanel')} onClick={closePanel}>
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      </header>

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

      <Tabs value={activeTab} onValueChange={(value) => selectTab(value as SidePanelTab)} className="lpv-app-main">
        <TabsList className="lpv-app-tabs">
          {subtitlesAvailable && <TabsTrigger value="subtitles">{t('subtitles')}</TabsTrigger>}
          <TabsTrigger value="page-translation">{t('pageTranslation')}</TabsTrigger>
        </TabsList>
        <TabsContent value="subtitles" className="lpv-app-tabpanel" id="lpv-panel-content">
          {subtitleContent}
        </TabsContent>
        <TabsContent value="page-translation" className="lpv-app-tabpanel" id="lpv-panel-content">
          {pageTranslationContent}
        </TabsContent>
      </Tabs>

      <LanguagePicker
        open={languagePickerOpen}
        l1Code={l1Code}
        l2Code={currentL2Code}
        onOpenChange={setLanguagePickerOpen}
        onConfirm={handleLanguageConfirm}
      />
    </div>
  );
}

const container = document.getElementById('lpv-side-panel-root');
if (container) {
  createRoot(container).render(<SidePanelApp />);
}
log('Side panel host loaded');
