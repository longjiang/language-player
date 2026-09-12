'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioTrack } from '@langplayer/textbooks';
import { createAssetResolver } from '@langplayer/textbooks';
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
 */

interface TaskAudioValue {
  /** The track currently playing, if any. */
  activeKey: string | null;
  /** 0–1 for the active track. */
  progress: number;
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
  tracks,
  children,
}: {
  tracks: AudioTrack[];
  children: React.ReactNode;
}) {
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const track of tracks) map.set(track.key, resolve(track.key));
    return map;
  }, [tracks, resolve]);

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
    if (!url) return;
    if (el.dataset.key !== activeKey) {
      el.dataset.key = activeKey;
      el.src = url;
      el.currentTime = 0;
      setProgress(0);
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

  const labelFor = useCallback((track: AudioTrack) => track.label ?? '', []);

  const value = useMemo<TaskAudioValue>(
    () => ({ activeKey, progress, failed, toggle, labelFor }),
    [activeKey, progress, failed, toggle, labelFor],
  );

  return (
    <TaskAudioContext.Provider value={value}>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setProgress(el.duration ? el.currentTime / el.duration : 0);
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
