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
import { t, setLocale, log, logwarn, logerr } from './i18n';
import { languageName } from './language-names';
import { ChevronDown } from './components/Icons';

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

/** Error boundary around the whole side-panel tree. Without it a render crash in
 *  the transcript, page panel, or a modal unmounts the entire React tree and
 *  leaves a blank panel with no recovery. This catches the crash and shows a
 *  friendly error + Retry instead (spec-086 §7/§11 "never blank"). */
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logerr('[SIDEPANEL] panel render error', { error: error?.message, stack: info?.componentStack });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="lpv-ui-empty-state" role="alert">
          <p>{t('pageUnavailable')}</p>
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            {t('retry')}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function SidePanelApp() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [mode, setMode] = useState<'video' | 'page' | null>(null);
  const [videoState, setVideoState] = useState<VideoPanelState | null>(null);
  const [pageState, setPageState] = useState<PagePanelState | null>(null);
  const [lookup, setLookup] = useState<PageLookupDetail | null>(null);
  /** Latest token hover (page reader) — tells the page-translation tab to scroll
   *  to and highlight the translation sentence under the cursor. */
  const [translationHover, setTranslationHover] = useState<{
    blockId: string | null;
    sentenceIndex: number;
    tokenOffset?: number | null;
    blockText?: string;
    tokenText?: string;
  } | null>(null);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [localeVersion, setLocaleVersion] = useState(0);
  const [l1Code, setL1Code] = useState('en');
  const [l2Code, setL2Code] = useState('en');
  const [selectedTab, setSelectedTab] = useState<SidePanelTab>('subtitles');
  const [theme, setTheme] = useState<Theme>('system');
  const [subtitleRequesting, setSubtitleRequesting] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  /** True while we're still resolving the active tab's mode (video/page) so the
   *  panel shows a clear loading state instead of a blank/empty surface. */
  const [panelLoading, setPanelLoading] = useState(true);
  /** Set when the mode never resolves (stale page / no content script) so the
   *  panel degrades to a friendly error + Retry rather than sitting blank. */
  const [panelError, setPanelError] = useState<string | null>(null);
  /** Auto-recovery poll counter (caps the retry loop before showing an error). */
  const panelPollCountRef = useRef(0);
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
    setPanelLoading(true);
    setPanelError(null);
    if (!tid) {
      setMode(null);
      setPanelLoading(false);
      return;
    }
    try {
      const res: any = await chrome.tabs.sendMessage(tid, { action: 'getPanelState' });
      if (tid !== tabIdRef.current) return; // stale pull — the active tab changed
      if (res?.state?.mode === 'video') {
        panelPollCountRef.current = 0;
        log('[SIDEPANEL] getPanelState → video mode', { tid, cues: res.state.cues?.length, status: res.state.subtitleStatus });
        setVideoState(res.state);
        setMode('video');
        setMismatchDismissed(false);
        setPanelLoading(false);
      } else if (res?.state?.mode === 'page') {
        panelPollCountRef.current = 0;
        log('[SIDEPANEL] getPanelState → page mode', { tid, status: res.state.pageTranslationStatus });
        setPageState(res.state);
        setLookup(res.state.lookup || null);
        setMode('page');
        setPanelLoading(false);
      } else {
        // Content script is present but reports no active mode yet (panelOpen /
        // pageTranslationTabOpen lifecycle not asserted, or a stale tab). Leave
        // panelLoading on so the retry loop re-pulls until it resolves.
        log('[SIDEPANEL] getPanelState returned no active mode; retrying', { tid, res: res?.state ?? null });
      }
    } catch (err) {
      if (tid !== tabIdRef.current) return; // stale pull — ignore
      // No content script (or not ready yet) — keep loading; the retry loop
      // recovers once the content script is injected / this tab is supported.
      const e = err as { message?: string } | undefined;
      // Capture the tab URL so we can tell whether the pull is aimed at a tab
      // that actually hosts our content script (video hosts) vs a tab that
      // legitimately has none (chrome://, the chrome Web Store, an unsupported
      // site). This is the key to distinguishing a real co-injection race from a
      // wrong-tab / unsupported-page pull.
      let tabUrl = 'unknown';
      if (tid != null) {
        try {
          const t = await chrome.tabs.get(tid);
          tabUrl = t?.url || t?.pendingUrl || 'no-url';
        } catch {
          tabUrl = 'tab-get-failed';
        }
      }
      logwarn('[SIDEPANEL] getPanelState failed (no content script?)', {
        tid,
        tabUrl,
        err: e?.message ?? String(err),
        tabIdRef: tabIdRef.current,
      });
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
      // Only clear the prior tab's state when the active tab actually changed.
      // A same-tab onUpdated (e.g. YouTube re-asserts status:'complete' during
      // player init) must not reset mode → null, or the panel flips back to the
      // loading/error state and can strand the learner on "page cannot be
      // translated" even though the subtitles resolved fine moments earlier.
      const previous = tabIdRef.current;
      const tabChanged = target !== previous;
      setTabId(target);
      // Sync the ref immediately (not just on the next render via `tabIdRef.current
      // = tabId`). Otherwise the first pullState's stale check (`tid !==
      // tabIdRef.current`) compares against the old/null tab and silently discards
      // content-entry's first valid getPanelState response — leaving mode stuck.
      tabIdRef.current = target;
      if (tabChanged) {
        setMode(null);
        setVideoState(null);
        setPageState(null);
        setLookup(null);
        panelPollCountRef.current = 0;
      }
      await pullState(target);
    };
    refresh();

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      refresh(info.tabId);
    };
    const onUpdated = (tid: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete' && tid === tabIdRef.current) {
        refresh(tid);
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [getActiveTabId, pullState]);

  // ── Auto-recovery ──
  // When the panel first opens, the content script may not have finished its
  // lifecycle setup yet (panelOpenState / pageTranslationVisibility race the
  // side panel's getPanelState pull), so getPanelState can return no active
  // mode and leave the panel blank. Keep re-pulling briefly so the panel
  // resolves on its own, then degrade to a friendly error + Retry instead of a
  // dead/blank panel that requires closing and reopening the panel.
  useEffect(() => {
    if (mode !== null || panelError) {
      panelPollCountRef.current = 0;
      return;
    }
    if (!panelLoading) return;
    const timer = setInterval(() => {
      if (mode !== null || panelError) return;
      panelPollCountRef.current += 1;
      if (panelPollCountRef.current > 8) {
        logwarn('[SIDEPANEL] mode never resolved after polling — showing error + retry', {
          attempts: panelPollCountRef.current,
          tabId: tabIdRef.current,
        });
        setPanelLoading(false);
        setPanelError(t('pageUnavailable'));
        return;
      }
      log('[SIDEPANEL] retrying getPanelState pull', { attempt: panelPollCountRef.current, tabId: tabIdRef.current });
      pullState(tabIdRef.current);
    }, 500);
    return () => clearInterval(timer);
  }, [mode, panelError, panelLoading, pullState]);

  const retryPanelResolve = useCallback(() => {
    panelPollCountRef.current = 0;
    setPanelError(null);
    setPanelLoading(true);
    pullState(tabIdRef.current);
  }, [pullState]);

  // ── Port to background: receives content-script state pushes ──
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'lpv-sidepanel' });
    port.onMessage.addListener((msg: any) => {
      if (!msg || msg.tabId !== tabIdRef.current) return;
      if (msg.action === 'panelState') {
        log('[SIDEPANEL] port panelState', { tabId: msg.tabId, ref: tabIdRef.current, cues: msg.state?.cues?.length, status: msg.state?.subtitleStatus });
        setVideoState(msg.state);
        setMode('video');
        setMismatchDismissed(false);
        setPanelLoading(false);
        setPanelError(null);
      } else if (msg.action === 'pageModeState') {
        setPageState(msg.state);
        setMode('page');
        setMismatchDismissed(false);
        setPanelLoading(false);
        setPanelError(null);
        if (msg.state?.lookup) setLookup(msg.state.lookup);
      } else if (msg.action === 'pageLookup') {
        setLookup(msg.payload);
      } else if (msg.action === 'pageTokenHover') {
        setTranslationHover(msg.payload);
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

  // Show the Subtitles tab optimistically while the tab's mode is still being
  // resolved (mode === null), so a video page shows the subtitles tab instead of
  // jumping straight to the Page Translation tab — the panel chrome (tab bar)
  // must always be visible so a slow/errored mode pull never leaves the learner
  // with no way to switch tabs.
  const subtitlesAvailable = mode === 'video' || !!videoState || mode === null;
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

  // If the content script pushed parsed cues, the subtitles are available — show
  // the transcript even if `subtitleStatus` is momentarily off (e.g. the pull
  // raced the detection lifecycle and reported 'idle'/'empty' while cues exist).
  const subtitleStatus = videoState?.cues?.length
    ? 'ready'
    : (videoState?.subtitleStatus || 'idle');
  const subtitleContent = mode === null ? (
      // Mode not resolved yet: spinner while pulling, or a friendly error + Retry
      // if it never resolves. Rendered inside the subtitles tab so the tab bar
      // and header stay visible and the learner can still switch tabs.
      <div className="lpv-ui-empty-state" role={panelError ? 'alert' : 'status'} aria-live="polite">
        {panelError ? (
          <>
            <p>{panelError}</p>
            <Button variant="outline" size="sm" onClick={retryPanelResolve}>{t('retry')}</Button>
          </>
        ) : (
          <>
            <span className="lpv-ui-spinner" aria-hidden="true" />
            <p>{t('loadingSubtitles')}</p>
          </>
        )}
      </div>
    ) : mode === 'video' && videoState && subtitleStatus === 'ready' ? (
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
        hover={translationHover}
      />
  ) : null;

  // Diagnostic: whenever the panel could be stuck in a loading/error state,
  // log the computed state so we can pinpoint why subtitles aren't showing.
  if (mode === null || panelError || activeTab === 'page-translation') {
    log('[SIDEPANEL] content state', {
      mode, activeTab, panelError, subtitleStatus,
      cues: videoState?.cues?.length, hasVideoState: !!videoState,
    });
  }

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
    <PanelErrorBoundary>
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
            <ChevronDown size={14} strokeWidth={2} className={`lpv-chevron${languagePickerOpen ? ' is-open' : ''}`} />
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
          <PanelErrorBoundary>{subtitleContent}</PanelErrorBoundary>
        </TabsContent>
        <TabsContent value="page-translation" className="lpv-app-tabpanel" id="lpv-panel-content">
          <PanelErrorBoundary>{pageTranslationContent}</PanelErrorBoundary>
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
    </PanelErrorBoundary>
  );
}

// Surface any uncaught error / unhandled rejection in the side panel's own
// devtools console so a render/runtime failure is diagnosable instead of a
// silent blank or a bare "page cannot be translated" with no cause.
window.addEventListener('error', (event) => {
  try { logerr('[SIDEPANEL] uncaught error', { message: event?.message, source: event?.filename, line: event?.lineno, col: event?.colno }); } catch {}
});
window.addEventListener('unhandledrejection', (event) => {
  try { logerr('[SIDEPANEL] unhandled rejection', { reason: String(event?.reason), name: event?.reason?.name }); } catch {}
});

const container = document.getElementById('lpv-side-panel-root');
if (container) {
  createRoot(container).render(<SidePanelApp />);
}
log('Side panel host loaded');
