// Re-exported from @langplayer/shared for cross-platform consistency.
// GO-specific extensions and aliases are kept here.

export { YouTubeVideo } from '@langplayer/shared';
export { SubtitleLine as Line, type SubtitleLine } from '@langplayer/shared';
export { SyncedLine } from '@langplayer/shared';

export interface VideoWithTranscriptProps {
  router: any; // Adjust the type according to your router's type
  video: import('@langplayer/shared').YouTubeVideo;
}