import type { SavedWordContext, SubsSearchVideo } from './types';

/**
 * Build a single-video `SubsSearchVideo` from a saved word's context so the
 * shared subs-search playback modal (`SubsSearchPlaybackModal`) can replay the
 * exact scene the word was saved from.
 *
 * Returns `null` when the context is not a video (or carries no `youtube_id`),
 * so callers can fall back to the non-playable source line.
 *
 * The context sentence becomes the one subtitle line, and `matchLineIndex` is
 * 0, so the modal cues/pauses the player exactly at `context.starttime` and
 * shows the sentence as the active subtitle — mirroring how a subs-search
 * result opens at its match line.
 */
export function buildPlaybackVideoFromContext(
  ctx: SavedWordContext | null | undefined,
): SubsSearchVideo | null {
  if (!ctx?.youtube_id) return null;
  return {
    id: 0,
    title: ctx.videoTitle ?? 'Video',
    youtube_id: ctx.youtube_id,
    subs_l2: [{ line: ctx.text ?? '', starttime: ctx.starttime ?? 0 }],
    matchLineIndex: 0,
  };
}
