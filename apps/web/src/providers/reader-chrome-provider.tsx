'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

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
  children: ReactNode;
  /** When provided, this provider is read-only and reports exactly this value
   *  (used by the reader overlay to re-render the Header unconditionally). */
  immersed?: boolean;
}) {
  const parent = useContext(ReaderChromeContext);
  const [immersed, setImmersedState] = useState(false);
  // The registered close handler is only ever *read* when requestCloseReader()
  // is invoked, so it lives in a ref rather than state. Keeping it as state
  // meant every register/unregister from a reader page's effect re-rendered
  // this provider, which re-rendered the consumers (and recreated their
  // callbacks), which re-triggered the effect → "Cannot update a component
  // while rendering a different component" / maximum-update-depth loop.
  const closeReaderRef = useRef<(() => void) | null>(null);

  const setImmersed = useCallback((v: boolean) => setImmersedState(v), []);

  // A nested (read-only) provider delegates registration to its parent, so a
  // reader screen registers its close handler on the outer provider and the
  // overlay Header (under the forced provider) reaches it through the parent.
  const requestCloseReader = useCallback(() => {
    if (closeReaderRef.current) closeReaderRef.current();
    else parent.requestCloseReader();
  }, [parent.requestCloseReader]);

  const registerCloseReader = useCallback((fn: (() => void) | null) => {
    if (forcedImmersed !== undefined) parent.registerCloseReader(fn);
    else closeReaderRef.current = fn;
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
