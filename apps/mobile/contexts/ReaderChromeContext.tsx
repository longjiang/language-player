import React, { createContext, useContext, useMemo, useState } from 'react';

interface ReaderChromeValue {
  /**
   * True while an immersive reader (EPUB) is open — the global app Header
   * hides itself so the book fills the screen.
   */
  immersed: boolean;
  /** Set/clear immersive mode from a reader screen. */
  setImmersed: (v: boolean) => void;
}

const ReaderChromeContext = createContext<ReaderChromeValue>({
  immersed: false,
  setImmersed: () => {},
});

/**
 * App-wide immersive-reader flag. An open EPUB reader sets `immersed`, which
 * hides the global Header (the reader renders its own top/bottom chrome as
 * overlays instead, so toggling the chrome never reflows the book).
 *
 * Nested providers with `immersed={false}` let the reader's overlay chrome
 * re-render the real app Header while the layout's copy stays hidden.
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
  const [immersed, setImmersed] = useState(false);
  const value = useMemo<ReaderChromeValue>(() => ({
    immersed: forcedImmersed ?? immersed,
    setImmersed: forcedImmersed !== undefined ? () => {} : setImmersed,
  }), [forcedImmersed, immersed]);
  return <ReaderChromeContext.Provider value={value}>{children}</ReaderChromeContext.Provider>;
}

export function useReaderChrome() {
  return useContext(ReaderChromeContext);
}
