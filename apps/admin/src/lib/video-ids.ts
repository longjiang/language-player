/**
 * Pull YouTube ids out of a pasted blob.
 *
 * Accepts bare ids and the URL shapes an admin is likely to paste:
 * `watch?v=ID`, `youtu.be/ID`, `/shorts/ID`, `/embed/ID`. Anything else is
 * passed through and left for the backend's `normalize_video_ids()` to
 * reject, so the error the admin sees is the server's, not ours.
 */
export function parseVideoIds(text: string): string[] {
  const ids: string[] = [];
  for (const token of text.split(/[\s,]+/)) {
    const trimmed = token.trim().replace(/^["']|["']$/g, '');
    if (!trimmed) continue;
    const fromUrl = trimmed.match(
      /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/,
    );
    ids.push(fromUrl?.[1] ?? trimmed);
  }
  return ids;
}
