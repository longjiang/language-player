// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { audioTracksIn, findTask, loadBook, type Task } from '@langplayer/textbooks';
import { TaskAudioProvider } from './task-audio';
import { AudioPlayer } from './audio-player';
import { InlineTrackButton } from './inline-track-button';

// These controls are icon-only; the only text they render is an accessible name that
// comes from the i18n layer rather than from the task.
vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));

let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  // jsdom has no media stack: `play()` would throw "Not implemented", which the
  // provider reports as a failed track and defeats the assertion.
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement['play'];
  HTMLMediaElement.prototype.pause = vi.fn();
});

async function task(id: string): Promise<Task> {
  const book = await loadBook('tblt-hsk4');
  if (!book) throw new Error('book tblt-hsk4 did not load');
  const found = findTask(book, id);
  if (!found) throw new Error(`task ${id} did not resolve`);
  return found;
}

/** The element the provider owns. */
function audioElement(): HTMLAudioElement {
  const el = document.querySelector('audio');
  if (!el) throw new Error('the provider rendered no audio element');
  return el;
}

/**
 * A task whose recordings hang off its items, played the way its widget plays them.
 *
 * The defect this file covers: the provider was handed only `task.audio[]`, so a
 * key declared anywhere else — a blank, a table row, a passage — had no URL. The
 * effect returned early, `play()` was never reached, and the control still flipped
 * to its "playing" state: a silent button that looked like a working one. Only A ➊,
 * the sole task with a task-level row, ever had a chance of making a sound.
 */
describe('TaskAudioProvider — every level a recording can be declared at', () => {
  it('plays the task-level row (A ➊), the one level that was already wired', async () => {
    const t = await task('tblt-hsk4.u06.A.t1');
    const key = t.audio![0]!.key;

    render(
      <TaskAudioProvider task={t}>
        <AudioPlayer tracks={t.audio!} />
      </TaskAudioProvider>,
    );
    await act(async () => {
      document.querySelector('button')!.click();
    });

    expect(play).toHaveBeenCalled();
    expect(decodeURIComponent(audioElement().src)).toContain(key);
  });

  it('plays a numbered item’s own recording (A ➋)', async () => {
    const t = await task('tblt-hsk4.u06.A.t2');
    const key = t.blanks!.b2!.audio![0]!.key;

    render(
      <TaskAudioProvider task={t}>
        <InlineTrackButton tracks={t.blanks!.b2!.audio} />
      </TaskAudioProvider>,
    );
    await act(async () => {
      document.querySelector('button')!.click();
    });

    expect(play).toHaveBeenCalled();
    expect(decodeURIComponent(audioElement().src)).toContain(key);
  });

  it('plays a table row’s recording (A ➌)', async () => {
    const t = await task('tblt-hsk4.u06.A.t3');
    const row = t.body.find((s) => s.kind === 'dataTable')!.rows[1]!;
    const key = row.audio![0]!.key;

    render(
      <TaskAudioProvider task={t}>
        <InlineTrackButton tracks={row.audio} />
      </TaskAudioProvider>,
    );
    await act(async () => {
      document.querySelector('button')!.click();
    });

    expect(play).toHaveBeenCalled();
    expect(decodeURIComponent(audioElement().src)).toContain(key);
  });

  it('plays a passage block’s recording (A ➍)', async () => {
    const t = await task('tblt-hsk4.u06.A.t4');
    const audio = t.body.find((s) => s.kind === 'passage')!.audio!;

    render(
      <TaskAudioProvider task={t}>
        <AudioPlayer tracks={audio} />
      </TaskAudioProvider>,
    );
    await act(async () => {
      document.querySelector('button')!.click();
    });

    expect(play).toHaveBeenCalled();
    expect(decodeURIComponent(audioElement().src)).toContain(audio[0]!.key);
  });

  it('resolves every recording the task declares, not just its own row', async () => {
    // The invariant behind the four cases above: whatever a control on the page can
    // be handed, the provider can turn into a URL.
    for (const id of ['tblt-hsk4.u06.A.t2', 'tblt-hsk4.u06.A.t3', 'tblt-hsk4.u06.A.t4']) {
      const t = await task(id);
      const playable = [
        ...(t.audio ?? []),
        ...Object.values(t.blanks ?? {}).flatMap((b) => b.audio ?? []),
        ...t.body.flatMap((s) =>
          s.kind === 'dataTable'
            ? s.rows.flatMap((row) => row.audio ?? [])
            : s.kind === 'passage' || s.kind === 'dialogue'
              ? (s.audio ?? [])
              : s.kind === 'audio'
                ? s.tracks
                : [],
        ),
      ];
      const known = new Set(audioTracksIn(t).map((track) => track.key));
      expect(playable.length).toBeGreaterThan(0);
      for (const track of playable) expect(known).toContain(track.key);
    }
  });
});
