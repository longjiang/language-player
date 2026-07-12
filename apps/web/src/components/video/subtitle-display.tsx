'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/providers/language-provider';

interface SubtitleDisplayProps {
  youtubeId: string;
  currentTime: number;
}

export function SubtitleDisplay({ youtubeId, currentTime }: SubtitleDisplayProps) {
  const { l1, l2 } = useLanguage();
  const [lines, setLines] = useState<{ l1Line: string; l2Line: string; starttime: number }[]>([]);
  const [showL1, setShowL1] = useState(true);
  const [showL2, setShowL2] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const fetchSubtitles = async () => {
      const res = await fetch(`/api/videos/${youtubeId}/subtitles?l2=${l2.code}`);
      if (!res.ok) return;
      const data = await res.json();
      setLines(data.lines ?? []);
    };
    fetchSubtitles().catch(() => {});
  }, [youtubeId, l2.code]);

  // Find the active line based on current playback time
  useEffect(() => {
    if (lines.length === 0) {
      setActiveIndex(-1);
      return;
    }
    // Find the last line whose starttime <= currentTime
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.starttime <= currentTime) {
        idx = i;
      } else {
        break;
      }
    }
    setActiveIndex(idx);
  }, [currentTime, lines]);

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        Subtitles are not available for this video yet.
      </div>
    );
  }

  return (
    <div>
      {/* Toggle buttons */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setShowL2(!showL2)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            showL2
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {l2.name} captions
        </button>
        <button
          onClick={() => setShowL1(!showL1)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            showL1
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {l1.name} translation
        </button>
      </div>

      {/* Subtitle lines */}
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border bg-card/50 p-4">
        {lines.map((line, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 transition-colors ${
                isActive ? 'bg-primary/10 ring-1 ring-primary/20' : ''
              }`}
              ref={isActive ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined}
            >
              {showL2 && (
                <p className={`text-sm ${isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {line.l2Line}
                </p>
              )}
              {showL1 && (
                <p className={`text-xs ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                  {line.l1Line}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
