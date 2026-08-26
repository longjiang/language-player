/**
 * Guards the immersive reader's blank-space tap surface (SPEC-085 §5) against
 * taps that would otherwise toggle the chrome when a dialog closes.
 *
 * On mobile the reader's tap surface is a full-area Pressable (TapSurfaceView
 * in PaginatedReader.tsx). A dialog that overlays it (popup dictionary, TOC,
 * Search) captures its own touches while open — but the tap that dismisses it
 * can still land on the surface (the overlay's pointerEvents flips to 'none'
 * the moment the popup starts closing, and RN can re-target a touch when the
 * responder unmounts). `suppressReaderTap()` is called whenever a reader
 * dialog closes; `toggleChrome` ignores taps inside that window.
 */

let suppressUntil = 0;

/** Suppress reader blank-tap toggles for `ms` (default 400). Call when a
 *  dialog that overlays the reader closes, so a stray tap that lands on the
 *  tap surface right after can't toggle the chrome. */
export function suppressReaderTap(ms = 400): void {
  suppressUntil = Date.now() + ms;
}

/** True when the reader's blank-tap surface must ignore a tap (a dialog was
 *  closed within the suppression window). */
export function isReaderTapSuppressed(): boolean {
  return Date.now() < suppressUntil;
}
