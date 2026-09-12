import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useVideoPlayer } from 'expo-video';
import { audioTracksIn, createAssetResolver, type Task } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { log } from '@/lib/logger';

/**
 * Task audio playback (SPEC-095).
 *
 * One provider owns ONE player for the whole task, and every control — the audio
 * row at the top and the inline control beside a table row, a numbered slot or a
 * dictation item — consumes it. Two reasons that matters:
 *
 * 1. **Only one track may play at a time.** The workbook's items are numbered, and
 *    letting a student start item 4 while item 2 is still playing produces answers
 *    to the wrong question.
 * 2. **Placement is a layout concern, not a playback one.** A track bound to a
 *    blank renders wherever that blank's widget puts it.
 *
 * Plays through `expo-video`, which is already a dependency and already linked
 * natively — `expo-av`/`expo-audio` are not installed, and adding one would need a
 * new development build. `expo-audio` is the better long-term home for audio-only
 * playback; this is the path that works without a rebuild.
 *
 * ⚠️ Not verified on a device or simulator: no screen of this feature has been
 * rendered in a simulator, so nothing here has been heard. The earlier note that
 * `expo-video` might need a mounted `VideoView` does not hold — the installed
 * version activates the audio session from the player's own playing state
 * (`VideoPlayer.onIsPlayingChanged` → `VideoManager.setAppropriateAudioSessionOrWarn`,
 * category `.playback`), and a view is only the video surface.
 *
 * Never autoplays.
 *
 * It takes the **task**, not a list of tracks: a task's recordings are declared at
 * four levels (task, blank, table row, block), and a provider handed only
 * `task.audio[]` resolved nothing for A ➋'s seven item recordings — every inline
 * control toggled to "playing" and stayed silent. The set is derived here from
 * `audioTracksIn` so a control cannot offer a track the player has never heard of.
 */

interface TaskAudioValue {
  activeKey: string | null;
  failed: Set<string>;
  toggle: (key: string) => void;
  /** Nudge the active track, and restart it — RN has no range input, so the
   *  transport is steppers rather than a scrub bar. */
  seekBy: (delta: number) => void;
  replay: () => void;
  /** Position and length, for the elapsed-time readout. */
  currentTime: number;
  duration: number;
}

const TaskAudioContext = createContext<TaskAudioValue | null>(null);

export function useTaskAudio(): TaskAudioValue | null {
  return useContext(TaskAudioContext);
}

export function TaskAudioProvider({
  task,
  children,
}: {
  task: Task;
  children: React.ReactNode;
}) {
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const track of audioTracksIn(task)) map.set(track.key, resolve(track.key));
    return map;
  }, [task, resolve]);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [position, setPosition] = useState({ currentTime: 0, duration: 0 });

  // Source follows the active track; `null` loads nothing until a tap.
  const source = activeKey ? { uri: urls.get(activeKey) ?? '' } : null;
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (activeKey === null) {
      player.pause();
      return;
    }
    if (!urls.has(activeKey)) {
      // A control playing a key the provider cannot resolve is a wiring defect, not a
      // broken file — it used to be a silent no-op that looked like a dead button.
      log('[LP Mobile] Textbook: no URL for track', activeKey, `(${urls.size} track(s) known)`);
      return;
    }
    try {
      player.play();
    } catch (err) {
      log('[LP Mobile] Textbook: audio play rejected', err);
      setFailed((f) => new Set(f).add(activeKey));
      setActiveKey(null);
    }
  }, [activeKey, player, urls]);

  // A finished track clears the selection, exactly as web's `onEnded` does, and
  // rewinds. Without it the control stays in its "playing" state and a second tap is
  // a no-op — the player is sitting at the end, and an ended AVPlayer does not
  // restart on `play()` the way an HTML `<audio>` element does, so the button looks
  // dead again, one tap later.
  useEffect(() => {
    const ended = player.addListener('playToEnd', () => {
      player.currentTime = 0;
      setActiveKey(null);
      setPosition({ currentTime: 0, duration: 0 });
    });
    return () => ended.remove();
  }, [player]);

  // `expo-video`'s player reports progress through its own event emitter rather than
  // a DOM element, so position is polled while something is playing.
  useEffect(() => {
    if (activeKey === null) {
      setPosition({ currentTime: 0, duration: 0 });
      return;
    }
    const id = setInterval(() => {
      const d = player.duration ?? 0;
      setPosition({ currentTime: player.currentTime ?? 0, duration: Number.isFinite(d) ? d : 0 });
    }, 250);
    return () => clearInterval(id);
  }, [activeKey, player]);

  const seekBy = useCallback(
    (delta: number) => {
      const d = player.duration ?? 0;
      const next = Math.max(0, Math.min(d || Number.MAX_SAFE_INTEGER, (player.currentTime ?? 0) + delta));
      player.currentTime = next;
      setPosition((p) => ({ ...p, currentTime: next }));
    },
    [player],
  );

  const replay = useCallback(() => {
    player.currentTime = 0;
    setPosition((p) => ({ ...p, currentTime: 0 }));
  }, [player]);

  const toggle = useCallback(
    (key: string) => {
      if (activeKey === key) {
        player.pause();
        setActiveKey(null);
        return;
      }
      setFailed((f) => {
        const next = new Set(f);
        next.delete(key);
        return next;
      });
      setActiveKey(key);
    },
    [activeKey, player],
  );

  const value = useMemo<TaskAudioValue>(
    () => ({
      activeKey,
      failed,
      toggle,
      seekBy,
      replay,
      currentTime: position.currentTime,
      duration: position.duration,
    }),
    [activeKey, failed, toggle, seekBy, replay, position],
  );

  return <TaskAudioContext.Provider value={value}>{children}</TaskAudioContext.Provider>;
}
