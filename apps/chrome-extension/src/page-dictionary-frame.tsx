/**
 * Extension-origin webpage dictionary modal.
 *
 * This document is loaded inside the iframe created by page-dictionary.tsx.
 * It reuses the same DictionaryModal and SavedWordsProvider as the side panel,
 * but its DOM is outside the webpage's CSS tree.
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LemmatizedToken } from '@langplayer/shared';
import DictionaryModal from './components/DictionaryModal';
import { SavedWordsProvider } from './components/SavedWordsProvider';
import { useSubscription } from './use-subscription';

const MESSAGE_SOURCE = 'language-player-page-dictionary';

interface PageDictionaryLookup {
  token: LemmatizedToken;
  blockText: string;
  blockId?: string | null;
  href?: string | null;
  l1Code?: string;
  l2Code?: string;
  pageUrl?: string;
}

function postToParent(message: unknown) {
  window.parent.postMessage({ source: MESSAGE_SOURCE, ...message as object }, '*');
}

function PageDictionaryFrame() {
  const [lookup, setLookup] = useState<PageDictionaryLookup | null>(null);
  const [language, setLanguage] = useState({ l1Code: 'en', l2Code: 'en' });
  const { isPro, loading: subLoading } = useSubscription();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!event.data || event.data.source !== MESSAGE_SOURCE) return;
      if (event.data.action === 'close') {
        setLookup(null);
        return;
      }
      if (event.data.action !== 'open' || !event.data.lookup?.token) return;
      const next = event.data.lookup as PageDictionaryLookup;
      setLanguage({
        l1Code: next.l1Code || 'en',
        l2Code: next.l2Code || 'en',
      });
      setLookup(next);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const token = lookup?.token || null;
  return (
    <div id="lpv-page-dictionary-frame-root">
      <SavedWordsProvider l2Code={language.l2Code}>
        <DictionaryModal
          token={token}
          l1Code={language.l1Code}
          l2Code={language.l2Code}
          contextText={lookup?.blockText}
          pageUrl={lookup?.pageUrl}
          linkUrl={lookup?.href}
          onFollowLink={(href) => postToParent({ action: 'follow-link', href })}
          isPro={isPro}
          subLoading={subLoading}
          onClose={() => {
            setLookup(null);
            postToParent({ action: 'close' });
          }}
        />
      </SavedWordsProvider>
    </div>
  );
}

const container = document.getElementById('lpv-page-dictionary-root');
if (container) createRoot(container).render(<PageDictionaryFrame />);
