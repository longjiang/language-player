'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioTrack, Task } from '@langplayer/textbooks';
import { audioTracksIn, createAssetResolver } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { log } from '@/lib/logger';

/**
 * Task audio playback (SPEC-095).
 *
 * One provider owns ONE media element for the whole task, and every control — the
 * audio row at the top and the inline play button beside a table row, a numbered
 * slot or a dictation item — is a consumer of it. Two reasons that matters:
 *
 * 1. **Only one track may play at a time.** The workbook's listening tasks are
 *    numbered items; letting a student start item 4 while item 2 is still playing
 *    produces answers to the wrong question. A per-control element could not
 *    enforce that without a registry anyway.
 * 2. **Placement is a layout concern, not a playback one.** A track bound to a
 *    blank renders wherever that blank's widget puts it, and nothing about the
 *    audio element has to move.
 *
 * Never autoplays: a browser blocks it anyway, and a task that starts speaking the
 * moment it opens is hostile in a classroom.
 *
 * It takes the **task**, not a list of tracks: a task's recordings are declared at
 * four levels (task, blank, table row, block), and a provider handed only
 * `task.audio[]` resolved nothing for A ➋'s seven item recordings — every inline
 * control toggled to "playing" and stayed silent, because the key had no URL. The
 * set is derived here from `audioTracksIn` so a control cannot offer a track the
 * player has never heard of.
 */

interface TaskAudioValue {
  /** The track currently playing, if any. */
  activeKey: string | null;
  /** 0–1 for the active track. */
  progress: number;
  /** Position and length in seconds, for the scrub control. 0 until metadata loads. */
  currentTime: number;
  duration: number;
  /** Jump to an absolute position, or nudge by a delta, on the active track. */
  seekTo: (seconds: number) => void;
  seekBy: (delta: number) => void;
  /** Restart the active track from the beginning. */
  replay: () => void;
  /** Clear a load failure and try the track again. */
  retry: (key: string) => void;
  /** Keys whose load failed, so their control can show as unavailable. */
  failed: Set<string>;
  /** Play this track, or pause it if it is already playing. */
  toggle: (key: string) => void;
  /** Accessible name for a compact control. */
  labelFor: (track: AudioTrack) => string;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const track of audioTracksIn(task)) map.set(track.key, resolve(track.key));
    return map;
  }, [task, resolve]);

  // Stop playback when the task changes or unmounts.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      el?.pause();
    };
  }, []);

  // Keep the element's source in step with the active track.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (activeKey === null) {
      el.pause();
      return;
    }
    const url = urls.get(activeKey);
    if (!url) {
      // A control playing a key the provider cannot resolve is a wiring defect, not
      // a broken file — it used to be a silent no-op that looked like a dead button.
      log(
        '[LP Web] Textbook: no URL for track',
        activeKey,
        `(${urls.size} track(s) known)`,
      );
      return;
    }
    if (el.dataset.key !== activeKey) {
      el.dataset.key = activeKey;
      el.src = url;
      el.currentTime = 0;
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
    }
    // A rejected play() (autoplay policy, missing file) must not break the task.
    void el.play().catch((err) => {
      log('[LP Web] Textbook: audio play rejected', err);
      setFailed((f) => new Set(f).add(activeKey));
      setActiveKey(null);
    });
  }, [activeKey, urls]);

  const toggle = useCallback((key: string) => {
    setActiveKey((current) => (current === key ? null : key));
  }, []);

  // Seeking is the control listening tasks live by: the workbook's own instructions
  // say 再听一遍, and a student who mishears one word should not have to sit through the
  // whole recording again.
  const seekTo = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : 0;
    el.currentTime = Math.max(0, Math.min(max, seconds));
    setCurrentTime(el.currentTime);
    setProgress(max ? el.currentTime / max : 0);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      if (!el) return;
      seekTo(el.currentTime + delta);
    },
    [seekTo],
  );

  const replay = useCallback(() => seekTo(0), [seekTo]);

  // Clearing the failure and re-selecting the track re-runs the load effect, which
  // is what actually retries; the element's cached key is dropped so the source is
  // set again rather than skipped.
  const retry = useCallback((key: string) => {
    const el = audioRef.current;
    if (el) delete el.dataset.key;
    setFailed((f) => {
      const next = new Set(f);
      next.delete(key);
      return next;
    });
    setActiveKey(null);
    setTimeout(() => setActiveKey(key), 0);
  }, []);

  const labelFor = useCallback((track: AudioTrack) => track.label ?? '', []);

  const value = useMemo<TaskAudioValue>(
    () => ({
      activeKey,
      progress,
      currentTime,
      duration,
      seekTo,
      seekBy,
      replay,
      retry,
      failed,
      toggle,
      labelFor,
    }),
    [activeKey, progress, currentTime, duration, seekTo, seekBy, replay, retry, failed, toggle, labelFor],
  );

  return (
    <TaskAudioContext.Provider value={value}>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setProgress(el.duration ? el.currentTime / el.duration : 0);
          setCurrentTime(el.currentTime);
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDuration(Number.isFinite(el.duration) ? el.duration : 0);
        }}
        onEnded={() => setActiveKey(null)}
        onError={() => {
          setActiveKey((key) => {
            if (key) setFailed((f) => new Set(f).add(key));
            return null;
          });
        }}
        className="hidden"
      />
      {children}
    </TaskAudioContext.Provider>
  );
}
