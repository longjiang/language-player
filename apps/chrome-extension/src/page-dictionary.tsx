/**
 * Webpage dictionary host.
 *
 * Page-mode lookups are rendered in the inspected page's viewport, while the
 * native side panel remains available underneath. The host is intentionally
 * event-driven: page-content.js owns tokenization and emits lookup details;
 * this bundle owns only the modal presentation.
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LemmatizedToken } from '@langplayer/shared';
import DictionaryModal from './components/DictionaryModal';
import { SavedWordsProvider } from './components/SavedWordsProvider';
import { useSubscription } from './use-subscription';
import type { PageLookupDetail } from './transcript-app';

interface PageDictionaryLookup extends PageLookupDetail {
  l1Code?: string;
  l2Code?: string;
  pageUrl?: string;
}

function PageDictionaryHost() {
  const [lookup, setLookup] = useState<PageDictionaryLookup | null>(null);
  const [language, setLanguage] = useState({ l1Code: 'en', l2Code: 'en' });
  const { isPro, loading: subLoading } = useSubscription();

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<PageDictionaryLookup>).detail;
      if (!detail?.token) return;
      setLanguage({
        l1Code: detail.l1Code || 'en',
        l2Code: detail.l2Code || 'en',
      });
      setLookup(detail);
    };
    const onClose = () => setLookup(null);
    window.addEventListener('lpv-page-dictionary-open', onOpen);
    window.addEventListener('lpv-page-dictionary-close', onClose);
    return () => {
      window.removeEventListener('lpv-page-dictionary-open', onOpen);
      window.removeEventListener('lpv-page-dictionary-close', onClose);
    };
  }, []);

  const token: LemmatizedToken | null = lookup?.token || null;
  return (
    <div className="lpv-page-dictionary-host">
      <SavedWordsProvider l2Code={language.l2Code}>
        <DictionaryModal
          token={token}
          l1Code={language.l1Code}
          l2Code={language.l2Code}
          contextText={lookup?.blockText}
          pageUrl={lookup?.pageUrl || location.href}
          isPro={isPro}
          subLoading={subLoading}
          onClose={() => setLookup(null)}
        />
      </SavedWordsProvider>
    </div>
  );
}

const container = document.createElement('div');
container.id = 'lpv-page-dictionary-root';
document.documentElement.appendChild(container);
createRoot(container).render(<PageDictionaryHost />);
