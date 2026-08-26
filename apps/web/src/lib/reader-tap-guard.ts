'use client';

/**
 * Guards the immersive reader's blank-space tap surface (SPEC-085 §5) against
 * clicks that would otherwise toggle the chrome when a dialog closes.
 *
 * A dialog that overlays the reader (popup dictionary, TOC, Search) is a Radix
 * portal, so taps inside it never reach the reader container — but the click
 * that DISMISSES it can: when the overlay unmounts before the browser fires
 * the `click` event (e.g. a slow click-and-hold, or a fast tap on a closing
 * dialog), the click is re-targeted to whatever is under the pointer — the
 * reader's tap surface — and toggles the chrome. The same applies to the
 * mobile native Pressable surface.
 *
 * `suppressReaderTap()` is called whenever a reader dialog closes; the tap
 * handlers ignore clicks inside that window. Additionally, while any dialog
 * overlay is still mounted (open, or animating out), reader taps are ignored
 * outright — matching SPEC-085 §11 ("Tap while a modal is open → hits the
 * modal backdrop; never toggles the reader chrome").
 */

let suppressUntil = 0;

/** Suppress reader blank-tap toggles for `ms` (default 350). Call when a
 *  dialog that overlays the reader closes, so the click that dismissed it
 *  can't land on the tap surface and toggle the chrome. */
export function suppressReaderTap(ms = 350): void {
  suppressUntil = Date.now() + ms;
}

/** True when the reader's blank-tap surface must ignore a click: a dialog was
 *  closed within the suppression window, or a dialog overlay is still in the
 *  DOM (open, or animating out). */
export function isReaderTapSuppressed(): boolean {
  if (Date.now() < suppressUntil) return true;
  if (typeof document !== 'undefined') {
    // Any Radix dialog overlay still mounted — the shared DialogOverlay
    // carries data-slot="dialog-overlay" (ui/dialog.tsx). The overlay absorbs
    // the click; it must never reach the reader's tap surface.
    if (document.querySelector('[data-slot="dialog-overlay"]')) return true;
  }
  return false;
}
