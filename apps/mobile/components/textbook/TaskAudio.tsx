import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useVideoPlayer } from 'expo-video';
import { createAssetResolver, type AudioTrack } from '@langplayer/textbooks';
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
 * ⚠️ Not verified on a device or simulator. If audio does not start, the likely cause
 * is that `expo-video` expects a mounted `VideoView` for playback; the fix is local
 * to this file (mount a zero-height `VideoView` bound to `player`).
 *
 * Never autoplays.
 */

interface TaskAudioValue {
  activeKey: string | null;
  failed: Set<string>;
  toggle: (key: string) => void;
}

const TaskAudioContext = createContext<TaskAudioValue | null>(null);

export function useTaskAudio(): TaskAudioValue | null {
  return useContext(TaskAudioContext);
}

export function TaskAudioProvider({
  tracks,
  children,
}: {
  tracks: AudioTrack[];
  children: React.ReactNode;
}) {
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const track of tracks) map.set(track.key, resolve(track.key));
    return map;
  }, [tracks, resolve]);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());

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
    try {
      player.play();
    } catch (err) {
      log('[LP Mobile] Textbook: audio play rejected', err);
      setFailed((f) => new Set(f).add(activeKey));
      setActiveKey(null);
    }
  }, [activeKey, player]);

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

  const value = useMemo<TaskAudioValue>(() => ({ activeKey, failed, toggle }), [activeKey, failed, toggle]);

  return <TaskAudioContext.Provider value={value}>{children}</TaskAudioContext.Provider>;
}
