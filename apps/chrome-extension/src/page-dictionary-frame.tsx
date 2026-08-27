/**
 * Extension-origin modal host for webpage dictionary lookups and side-panel
 * actions. Keeping every modal in this iframe prevents the host page's CSS
 * from changing the Language Player UI.
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LemmatizedToken } from '@langplayer/shared';
import type { AuthState } from './auth';
import { AccountModal } from './components/AccountModal';
import { AboutModal } from './components/AboutModal';
import DictionaryModal from './components/DictionaryModal';
import { HelpModal } from './components/HelpModal';
import { LanguagePicker } from './components/LanguagePicker';
import { SavedWordsProvider } from './components/SavedWordsProvider';
import { SettingsModal } from './components/SettingsModal';
import { LoginDialog } from './components/UserMenu';
import { useSubscription } from './use-subscription';
import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';
import { Dialog } from './components/ui/dialog';
import { Markdown } from './components/Markdown';
import { logwarn, t } from './i18n';

const MESSAGE_SOURCE = 'language-player-page-dictionary';
type Theme = 'light' | 'dark' | 'system';

interface PageDictionaryLookup {
  token: LemmatizedToken;
  blockText: string;
  blockId?: string | null;
  href?: string | null;
  l1Code?: string;
  l2Code?: string;
  pageUrl?: string;
}

interface LineExplanationRequest {
  cue: { text: string; start: number; end: number };
  l1Code: string;
  l2Code: string;
}

type ModalPayload =
  | { kind: 'language'; l1Code: string; l2Code: string }
  | { kind: 'settings'; l2Code: string }
  | { kind: 'help' }
  | { kind: 'about' }
  | { kind: 'login' }
  | { kind: 'dictionary'; token: LemmatizedToken; l1Code: string; l2Code: string; contextText?: string; cueStartTime?: number; videoTitle?: string; pageUrl?: string }
  | { kind: 'line-explanation'; request: LineExplanationRequest }
  | { kind: 'account'; auth: AuthState; l1Code: string; l2Code: string };

function postToParent(message: unknown) {
  window.parent.postMessage({ source: MESSAGE_SOURCE, ...message as object }, '*');
}

function postModalEvent(event: unknown) {
  postToParent({ action: 'page-modal-event', event });
}

function applyTheme(theme: Theme) {
  const isDark = theme === 'dark'
    || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.dataset.theme = theme;
}

function DictionarySurface({ lookup, modal, onClose }: {
  lookup?: PageDictionaryLookup;
  modal?: Extract<ModalPayload, { kind: 'dictionary' }>;
  onClose: () => void;
}) {
  const { isPro, loading: subLoading } = useSubscription();
  const token = modal?.token || lookup?.token || null;
  const l1Code = modal?.l1Code || lookup?.l1Code || 'en';
  const l2Code = modal?.l2Code || lookup?.l2Code || 'en';
  return (
    <SavedWordsProvider l2Code={l2Code}>
      <DictionaryModal
        token={token}
        l1Code={l1Code}
        l2Code={l2Code}
        contextText={modal?.contextText || lookup?.blockText}
        cueStartTime={modal?.cueStartTime}
        videoTitle={modal?.videoTitle}
        pageUrl={modal?.pageUrl || lookup?.pageUrl}
        linkUrl={lookup?.href}
        onFollowLink={(href) => postToParent({ action: 'follow-link', href })}
        isPro={isPro}
        subLoading={subLoading}
        onClose={onClose}
      />
    </SavedWordsProvider>
  );
}

function LineExplanationSurface({ modal, onClose }: { modal: Extract<ModalPayload, { kind: 'line-explanation' }>; onClose: () => void }) {
  const { isPro } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    const { cue, l1Code, l2Code } = modal.request;
    const prompt = `Provide a clear breakdown of the following ${l2Code} text. Include:
1. Its overall meaning in ${l1Code.toUpperCase()}
2. A phrase-by-phrase breakdown explaining how the text is constructed

Text: ${cue.text}`;
    setLoading(true);
    setText(null);
    setError(null);
    apiFetch(`${API_BASE}/chatgpt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: any = await response.json();
      if (!cancelled) setText(data.response || data.text || data.result || JSON.stringify(data));
    }).catch((err: any) => {
      if (!cancelled) {
        logwarn('Line explanation failed', { message: err?.message, l1Code, l2Code });
        setError(err?.message || t('failedToLoadSubtitles'));
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isPro, modal]);

  return (
    <Dialog open title={t('explainTitle')} closeLabel={t('close')} onOpenChange={(open) => { if (!open) onClose(); }} className="lpv-line-explanation-dialog">
      {loading && <div className="lpv-explain-loading"><span className="lpv-spinner" /> {t('aiThinking')}</div>}
      {error && <div className="lpv-explain-error">{error}</div>}
      {text && <div className="lpv-explain-section" style={{ borderBottom: 'none' }}><Markdown text={text} /></div>}
    </Dialog>
  );
}

function PageDictionaryFrame() {
  const [lookup, setLookup] = useState<PageDictionaryLookup | null>(null);
  const [modal, setModal] = useState<ModalPayload | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!event.data || event.data.source !== MESSAGE_SOURCE) return;
      if (event.data.action === 'close') {
        setLookup(null);
        setModal(null);
        return;
      }
      if (event.data.action === 'open' && event.data.lookup?.token) {
        const next = event.data.lookup as PageDictionaryLookup;
        setModal(null);
        setLookup(next);
        return;
      }
      if (event.data.action === 'open-modal' && event.data.modal?.kind) {
        const next = event.data.modal as ModalPayload;
        setLookup(null);
        setModal(next);
        if (event.data.theme) applyTheme(event.data.theme as Theme);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const close = () => {
    setLookup(null);
    setModal(null);
    postModalEvent({ action: 'close' });
  };

  const modalContent = modal?.kind === 'dictionary'
    ? <DictionarySurface modal={modal} onClose={close} />
    : modal?.kind === 'line-explanation'
      ? <LineExplanationSurface modal={modal} onClose={close} />
      : modal?.kind === 'language'
        ? <LanguagePicker open l1Code={modal.l1Code} l2Code={modal.l2Code} onOpenChange={(open) => { if (!open) close(); }} onConfirm={(l1Code, l2Code, traditional) => { postModalEvent({ action: 'languageConfirm', l1Code, l2Code, traditional }); setModal(null); }} />
        : modal?.kind === 'settings'
          ? <SettingsModal open l2Code={modal.l2Code} onOpenChange={(open) => { if (!open) close(); }} onThemeChange={(theme) => { applyTheme(theme); postModalEvent({ action: 'themeChange', theme }); }} />
          : modal?.kind === 'help'
            ? <HelpModal open onOpenChange={(open) => { if (!open) close(); }} />
            : modal?.kind === 'about'
              ? <AboutModal open onOpenChange={(open) => { if (!open) close(); }} />
              : modal?.kind === 'login'
                ? <LoginDialog open onOpenChange={(open) => { if (!open) close(); }} onLoggedIn={() => { postModalEvent({ action: 'loggedIn' }); setModal(null); }} />
                : modal?.kind === 'account'
                  ? <AccountModal open auth={modal.auth} l1Code={modal.l1Code} l2Code={modal.l2Code} onOpenChange={(open) => { if (!open) close(); }} onLoggedOut={() => { postModalEvent({ action: 'loggedOut' }); setModal(null); }} />
                  : null;

  return <div id="lpv-page-dictionary-frame-root">{modalContent || (lookup && <DictionarySurface lookup={lookup} onClose={close} />)}</div>;
}

const container = document.getElementById('lpv-page-dictionary-root');
if (container) createRoot(container).render(<PageDictionaryFrame />);
