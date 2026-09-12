// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { findTask, loadBook, type Task } from '@langplayer/textbooks';
import { TaskAudioProvider } from './task-audio';
import { AudioPlayer } from './audio-player';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));

/**
 * A task can print several players (A ➍ prints five, one per passage) while ONE provider
 * owns the playback, because only one recording may play at a time.
 *
 * That makes position and duration task-wide — and a transport row-wide. Unscoped, playing
 * the first of A ➍'s five passages moved all five bars to `0:06 / 0:21` and armed all five
 * replays, so four rows misreported the recording and offered a scrub bar that would have
 * seeked somebody else's file.
 */
describe('transport scoping', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  async function taskA4(): Promise<Task> {
    const book = await loadBook('tblt-hsk4');
    const found = book && findTask(book, 'tblt-hsk4.u06.A.t4');
    if (!found) throw new Error('task A ➍ did not resolve');
    return found;
  }

  const ranges = () => [...document.querySelectorAll('input[type=range]')] as HTMLInputElement[];
  const times = () => [...document.querySelectorAll('span.tabular-nums')].map((n) => n.textContent);

  it('moves only the bar of the row whose recording is playing', async () => {
    const t = await taskA4();
    const passages = t.body.filter((s) => s.kind === 'passage');
    expect(passages.length).toBeGreaterThan(1);

    render(
      <TaskAudioProvider task={t}>
        <AudioPlayer tracks={passages[0]!.audio!} />
        <AudioPlayer tracks={passages[1]!.audio!} />
      </TaskAudioProvider>,
    );

    // Nothing playing: every bar is empty and inert.
    expect(ranges().map((r) => r.disabled)).toEqual([true, true]);
    expect(times()).toEqual(['0:00 / 0:00', '0:00 / 0:00']);

    await act(async () => {
      (document.querySelectorAll('section button[aria-pressed]')[0] as HTMLButtonElement).click();
    });

    // jsdom has no media stack: report the first track's metadata by hand, which is what a
    // real browser's `loadedmetadata` does.
    const el = document.querySelector('audio')!;
    Object.defineProperty(el, 'duration', { value: 21, configurable: true });
    await act(async () => {
      el.dispatchEvent(new Event('loadedmetadata'));
    });

    // The row that is playing owns the transport…
    expect(ranges()[0]!.disabled).toBe(false);
    expect(ranges()[0]!.getAttribute('max')).toBe('21');
    expect(times()[0]).toBe('0:00 / 0:21');

    // …and the other row is untouched: empty, disabled, and showing no duration it has no
    // way to know.
    expect(ranges()[1]!.disabled).toBe(true);
    expect(ranges()[1]!.getAttribute('max')).toBe('0');
    expect(times()[1]).toBe('0:00 / 0:00');
  });
});
