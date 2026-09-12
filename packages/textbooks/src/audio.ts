/**
 * Track placement (SPEC-095).
 *
 * Audio belongs to the task, not to a stimulus block, but most tracks belong to
 * one *item* within it — a table row, a numbered slot, a dictation item. These
 * helpers resolve that relationship so a widget can ask "is there a track for the
 * blank I am rendering?" without knowing anything about how tasks are stored.
 *
 * Pure and platform-agnostic: both apps' widgets call these, per ADR-0003.
 */

import type { AudioTrack } from './types';

/** Tracks that belong to the task as a whole, rendered in the top audio row. */
export function unanchoredTracks(tracks: readonly AudioTrack[] | undefined): AudioTrack[] {
  return (tracks ?? []).filter((track) => !track.blankId);
}

/** Tracks bound to a specific item, placed by whichever widget renders that blank. */
export function anchoredTracks(tracks: readonly AudioTrack[] | undefined): AudioTrack[] {
  return (tracks ?? []).filter((track) => Boolean(track.blankId));
}

/**
 * The track for one blank, if any.
 *
 * Returns the first match. The validator rejects two tracks anchored to the same
 * blank, so "first" and "only" coincide in valid content; being total here keeps
 * a malformed task rendering rather than throwing in a student's session.
 */
export function trackForBlank(
  tracks: readonly AudioTrack[] | undefined,
  blankId: string | undefined,
): AudioTrack | undefined {
  if (!blankId) return undefined;
  return (tracks ?? []).find((track) => track.blankId === blankId);
}

/**
 * The track for an item made of several blanks (A ➌'s rows hold two).
 *
 * Used by a container that knows the blanks an item owns but not which one was
 * used as the anchor.
 */
export function trackForAnyBlank(
  tracks: readonly AudioTrack[] | undefined,
  blankIds: readonly string[],
): AudioTrack | undefined {
  const wanted = new Set(blankIds);
  return (tracks ?? []).find((track) => track.blankId && wanted.has(track.blankId));
}
