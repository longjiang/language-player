'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioTrack } from '@langplayer/textbooks';
import { createAssetResolver } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { indexToCircled } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';

/**
 * Task audio.
 *
 * Deliberately plays ONE track at a time from a shared element: the workbook's
 * listening tasks are numbered items (① ② ③), and letting a student start item 4
 * while item 2 is still playing produces answers to the wrong question.
 *
 * Never autoplays — a browser blocks it anyway, and a task that starts speaking
 * the moment it opens is hostile in a classroom.
 */
export function AudioPlayer({ tracks }: { tracks: AudioTrack[] }) {
  const t = useT();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  const urls = useMemo(() => tracks.map((track) => resolve(track.key)), [tracks, resolve]);

  // Stop playback when the task changes or the component unmounts.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Keep the element's source in step with the active track.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || active === null) return;
    el.src = urls[active] ?? '';
    el.currentTime = 0;
    setProgress(0);
    // A rejected play() (autoplay policy, missing file) must not break the task.
    void el.play().catch(() => {
      setFailed((f) => ({ ...f, [active]: true }));
      setActive(null);
    });
  }, [active, urls]);

  if (tracks.length === 0) return null;

  const toggle = (index: number) => {
    const el = audioRef.current;
    if (active === index) {
      el?.pause();
      setActive(null);
      return;
    }
    setActive(index);
  };

  const single = tracks.length === 1;

  return (
    <section
      aria-label={t('label.subtitles')}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setProgress(el.duration ? el.currentTime / el.duration : 0);
        }}
        onEnded={() => setActive(null)}
        onError={() => {
          if (active !== null) {
            setFailed((f) => ({ ...f, [active]: true }));
            setActive(null);
          }
        }}
        className="hidden"
      />

      {single ? (
        <div className="flex items-center gap-3">
          <PlayButton
            playing={active === 0}
            label={t('action.speak')}
            onClick={() => toggle(0)}
          />
          <ProgressBar value={active === 0 ? progress : 0} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {tracks.map((track, index) => (
              <button
                key={track.key}
                type="button"
                onClick={() => toggle(index)}
                aria-label={track.label ?? `track ${index + 1}`}
                aria-pressed={active === index}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors ${
                  active === index
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {indexToCircled(index + 1)}
              </button>
            ))}
          </div>
          <ProgressBar value={active !== null ? progress : 0} />
        </>
      )}

      {Object.keys(failed).length > 0 && (
        <p className="text-xs text-muted-foreground">{t('msg.failed_to_load_url')}</p>
      )}
    </section>
  );
}

function PlayButton({
  playing,
  label,
  onClick,
}: {
  playing: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={playing}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      {playing ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
          <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 1l9 5-9 5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-150"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}
