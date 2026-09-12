import React from 'react';
import type { AudioTrack } from '@langplayer/textbooks';
import { TrackControls } from './TrackControls';

/**
 * The control an item renders beside itself for its own recording (SPEC-095).
 *
 * Takes the item's OWN recordings — a row's, a numbered slot's, a dictation item's —
 * rather than looking anything up, so there is no correspondence to get wrong. It renders
 * nothing when the item has no recording, so a widget can place it unconditionally.
 *
 * The control itself is `TrackControls`: one pill holding play/pause and, when the
 * recording has a transcript, the button that opens it. Kept as a named component because
 * it is the seam the widgets place — a `DataTable` row, a `NumberedBlanks` slot, a
 * `Dictation` item — and those call sites must not have to know how the pill is built.
 */
export function InlineTrackButton({ tracks }: { tracks?: AudioTrack[] }) {
  const track = tracks?.[0];
  if (!track) return null;
  return <TrackControls track={track} />;
}
