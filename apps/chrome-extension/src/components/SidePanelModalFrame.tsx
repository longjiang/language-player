import React, { useEffect, useRef, useState } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import type { AuthState } from '../auth';
import type { LineExplanationRequest } from '../transcript-app';

const MESSAGE_SOURCE = 'language-player-sidepanel-modal';

export type SidePanelModal =
  | { kind: 'language'; l1Code: string; l2Code: string }
  | { kind: 'settings'; l2Code: string }
  | { kind: 'help' }
  | { kind: 'about' }
  | { kind: 'login' }
  | { kind: 'dictionary'; token: LemmatizedToken; l1Code: string; l2Code: string; contextText?: string; cueStartTime?: number; videoTitle?: string; pageUrl?: string }
  | { kind: 'line-explanation'; request: LineExplanationRequest }
  | { kind: 'account'; auth: AuthState; l1Code: string; l2Code: string };

interface SidePanelModalFrameProps {
  modal: SidePanelModal | null;
  theme: 'light' | 'dark' | 'system';
  onClose: () => void;
  onLanguageConfirm: (l1Code: string, l2Code: string, traditional: boolean) => void;
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
}

const frameUrl = chrome.runtime.getURL('src/sidepanel-modal-frame.html');
const frameOrigin = new URL(frameUrl).origin;

export function SidePanelModalFrame({ modal, theme, onClose, onLanguageConfirm, onThemeChange }: SidePanelModalFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  const send = (message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(
      { source: MESSAGE_SOURCE, ...message as object },
      frameOrigin,
    );
  };

  useEffect(() => {
    if (!ready) return;
    if (modal) send({ action: 'open', modal, theme });
    else send({ action: 'close' });
  }, [modal, ready, theme]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== frameOrigin) return;
      if (!event.data || event.data.source !== MESSAGE_SOURCE) return;
      switch (event.data.action) {
        case 'close':
        case 'loggedIn':
        case 'loggedOut':
          onClose();
          break;
        case 'languageConfirm':
          onLanguageConfirm(event.data.l1Code, event.data.l2Code, event.data.traditional === true);
          break;
        case 'themeChange':
          if (event.data.theme === 'light' || event.data.theme === 'dark' || event.data.theme === 'system') {
            onThemeChange(event.data.theme);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose, onLanguageConfirm, onThemeChange]);

  return (
    <iframe
      ref={frameRef}
      className="lpv-sidepanel-modal-frame"
      title="Language Player dialog"
      src={frameUrl}
      aria-hidden={modal ? undefined : true}
      style={{
        pointerEvents: modal ? 'auto' : 'none',
        visibility: modal ? 'visible' : 'hidden',
      }}
      onLoad={() => setReady(true)}
    />
  );
}
