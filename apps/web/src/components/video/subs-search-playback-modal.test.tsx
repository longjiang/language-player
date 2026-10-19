// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { SubsSearchVideo } from '@langplayer/shared';

/**
 * The "Load Full Subtitles" notice must only reflect a real playhead.
 *
 * The YouTube IFrame API reports its position only after the embed loads and
 * seeks (polled every 500 ms), so right after the modal opens `currentTime`
 * used to be 0 while the loaded range started at the match line — the notice
 * (and the pause-on-out-of-range effect) flashed until the first time update.
 * The modal now assumes the match-line cue and only trusts an out-of-range
 * position after the player has reported a position inside the range.
 */

const player = vi.hoisted(() => ({
  onTimeUpdate: undefined as ((time: number) => void) | undefined,
}));

vi.mock('@/components/video/youtube-player', () => ({
  YouTubePlayer: ({ onTimeUpdate }: { onTimeUpdate?: (time: number) => void }) => {
    player.onTimeUpdate = onTimeUpdate;
    return null;
  },
  PLAYER_STATES: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
}));
vi.mock('@/components/video/video-control-bar', () => ({ VideoControlBar: () => null }));
vi.mock('@/components/video/subtitle-display', () => ({ SubtitleDisplay: () => null }));
vi.mock('@/components/video/video-sidebar-panel', () => ({ VideoSidebarPanel: () => null }));
vi.mock('next/link', () => ({ default: (props: { children?: unknown }) => props.children }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en' }, l2: { code: 'ja' } }),
}));
vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/lib/logger', () => ({ log: () => {} }));

import { SubsSearchPlaybackModal } from './subs-search-playback-modal';

// Loaded subtitle range: 30s–45s (last line 40s + 5s fallback). Match is at 35s.
const VIDEO: SubsSearchVideo = {
  id: 1,
  title: 'Test video',
  youtube_id: 'abc123',
  subs_l2: [
    { starttime: 30, line: 'one' },
    { starttime: 35, line: 'two' },
    { starttime: 40, line: 'three' },
  ],
  matchLineIndex: 1,
};

const NOTICE = 'msg.subs_out_of_range';

function renderModal() {
  return render(
    <SubsSearchPlaybackModal
      videos={[VIDEO]}
      index={0}
      onIndexChange={() => {}}
      highlightTerms={[]}
      onLoadFullSubtitles={() => {}}
    />,
  );
}

/** Simulate the YouTube player's time polling callback. */
function reportTime(time: number) {
  act(() => player.onTimeUpdate?.(time));
}

describe('SubsSearchPlaybackModal out-of-range notice', () => {
  beforeEach(() => {
    player.onTimeUpdate = undefined;
  });

  it('is hidden before the player reports, and for an unseeked 0 report', () => {
    const view = renderModal();
    // Nothing reported yet: the modal assumes the match-line cue (35s).
    expect(view.queryByText(NOTICE)).toBeNull();
    // A fresh embed can report 0 for one poll before its cue/seek applies.
    reportTime(0);
    expect(view.queryByText(NOTICE)).toBeNull();
  });

  it('appears once the playhead leaves a range it has actually played inside', () => {
    const view = renderModal();
    reportTime(35); // the cue landed at the match line
    expect(view.queryByText(NOTICE)).toBeNull();
    reportTime(60); // beyond the last line's end (45s)
    expect(view.queryByText(NOTICE)).not.toBeNull();
  });
});
