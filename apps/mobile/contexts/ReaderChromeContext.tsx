import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { log } from '@/lib/logger';

interface ReaderChromeValue {
  /**
   * True while an immersive reader (EPUB) is open — the global app Header
   * hides itself so the book fills the screen.
   */
  immersed: boolean;
  /** Set/clear immersive mode from a reader screen. */
  setImmersed: (v: boolean) => void;
  /**
   * Ask the open immersive reader to close itself (used by the nav menu when
   * the reader's own "Epub Reader" item is tapped while the reader is already
   * open — an alternative to the reader's own close button). No-op when no
   * reader screen has registered a close handler.
   */
  requestCloseReader: () => void;
  /** Register the reader screen's close handler (or null to unregister). */
  registerCloseReader: (fn: (() => void) | null) => void;
}

const ReaderChromeContext = createContext<ReaderChromeValue>({
  immersed: false,
  setImmersed: () => {},
  requestCloseReader: () => {},
  registerCloseReader: () => {},
});

/**
 * App-wide immersive-reader flag. An open EPUB reader sets `immersed`, which
 * hides the global Header (the reader renders its own top/bottom chrome as
 * overlays instead, so toggling the chrome never reflows the book).
 *
 * Nested providers with `immersed={false}` let the reader's overlay chrome
 * re-render the real app Header while the layout's copy stays hidden. A
 * nested provider inherits the registered close handler from its parent, so
 * the overlay Header can close the book through the same action the reader
 * screen registered.
 */
export function ReaderChromeProvider({
  children,
  immersed: forcedImmersed,
}: {
  children: React.ReactNode;
  /** When provided, this provider is read-only and reports exactly this value
   *  (used by the reader overlay to re-render the Header unconditionally). */
  immersed?: boolean;
}) {
  const parent = useContext(ReaderChromeContext);
  const [immersed, setImmersedState] = useState(false);
  const [closeReader, setCloseReader] = useState<(() => void) | null>(null);

  const setImmersed = useCallback((v: boolean) => setImmersedState(v), []);

  // A nested (read-only) provider delegates registration to its parent, so a
  // reader screen registers its close handler on the outer provider and the
  // overlay Header (under the forced provider) reaches it through the parent.
  const requestCloseReader = useCallback(() => {
    log('[readerChrome] requestCloseReader', { hasCloseReader: Boolean(closeReader), forcedImmersed });
    if (closeReader) closeReader();
    else parent.requestCloseReader();
  }, [closeReader, parent.requestCloseReader]);

  const registerCloseReader = useCallback((fn: (() => void) | null) => {
    log('[readerChrome] registerCloseReader', { forcedImmersed, hasFn: Boolean(fn) });
    if (forcedImmersed !== undefined) parent.registerCloseReader(fn);
    else setCloseReader(fn);
  }, [forcedImmersed, parent.registerCloseReader]);

  const value = useMemo<ReaderChromeValue>(() => ({
    immersed: forcedImmersed ?? immersed,
    setImmersed: forcedImmersed !== undefined ? () => {} : setImmersed,
    requestCloseReader,
    registerCloseReader,
  }), [forcedImmersed, immersed, setImmersed, requestCloseReader, registerCloseReader]);
  return <ReaderChromeContext.Provider value={value}>{children}</ReaderChromeContext.Provider>;
}

export function useReaderChrome() {
  return useContext(ReaderChromeContext);
}
