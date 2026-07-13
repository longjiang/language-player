'use client';

import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { getShowTranslation, setShowTranslation } from '@/lib/settings';
import { TokenizedText } from '@/components/tokenized-text';
import type { SubtitleLine } from '@langplayer/shared';
import { Settings2 } from 'lucide-react';
import { baseCode } from '@/lib/language-data';

interface SyncedLine {
  l1Line: string;
  l2Line: string;
  starttime: number;
}

function syncLines(l1Lines: SubtitleLine[], l2Lines: SubtitleLine[]): SyncedLine[] {
  l1Lines = [...l1Lines].sort((a, b) => a.starttime - b.starttime);
  l2Lines = [...l2Lines].sort((a, b) => a.starttime - b.starttime);
  const synced: SyncedLine[] = [];
  const used = new Set<number>();

  for (const l1 of l1Lines) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < l2Lines.length; i++) {
      if (!used.has(i)) {
        const diff = Math.abs(l1.starttime - l2Lines[i]!.starttime);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
    }
    if (bestIdx !== -1) {
      used.add(bestIdx);
      synced.push({ starttime: l1.starttime, l1Line: l1.line, l2Line: l2Lines[bestIdx]!.line });
    }
  }
  for (let i = 0; i < l2Lines.length; i++) {
    if (!used.has(i)) {
      synced.push({ starttime: l2Lines[i]!.starttime, l1Line: '', l2Line: l2Lines[i]!.line });
    }
  }
  return synced.sort((a, b) => a.starttime - b.starttime);
}

interface SubtitleDisplayProps {
  youtubeId: string;
  currentTime: number;
  /** Video title for word-saving context */
  videoTitle?: string;
  /** Called with the array of start times for prev/next line navigation */
  onLinesLoaded?: (startTimes: number[]) => void;
  /** Called when user clicks a subtitle line (outside a word) */
  onSeekToLine?: (starttime: number) => void;
  /** Ref to the scrollable container — when provided, scrolling only happens when line leaves view */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Pre-loaded subtitle lines — if provided, skips the subtitles API fetch */
  initialLines?: { starttime: number; l1Line: string; l2Line: string }[];
}

/**
 * Strip duration prefix from subtitle text.
 * Raw format: "0.64,来" → "来"
 * Duration is a float + comma prefix, e.g. "1.08," or "0.64,"
 */
function stripDurationPrefix(text: string): string {
  return text.replace(/^[\d.]+,\s*/, '');
}

export function SubtitleDisplay({ youtubeId, currentTime, videoTitle, onLinesLoaded, onSeekToLine, scrollContainerRef, initialLines }: SubtitleDisplayProps) {
  const { l1, l2 } = useLanguage();
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [showTranslation, setShowTranslationState] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (initialLines) {
      const l2Only = initialLines.map(l => ({ line: stripDurationPrefix(l.l2Line), starttime: l.starttime }));
      setL2Lines(l2Only);
      onLinesLoaded?.(l2Only.map(l => l.starttime));
      return;
    }
    const fetchSubtitles = async () => {
      const res = await fetch(`/api/videos/${youtubeId}/subtitles?l2=${baseCode(l2.code)}`);
      if (!res.ok) return;
      const data = await res.json();
      const lines = data.lines?.map((l: any) => ({
        line: stripDurationPrefix(l.l2Line ?? ''),
        starttime: l.starttime,
      })) ?? [];
      setL2Lines(lines);
      onLinesLoaded?.(lines.map((l: SubtitleLine) => l.starttime));
    };
    fetchSubtitles().catch(() => {});
  }, [youtubeId, l2.code, initialLines]);

  useEffect(() => {
    setShowTranslationState(getShowTranslation());
  }, []);

  const { translatedLines, loading: translating, progress } = useSubtitleTranslation(
    l2Lines,
    l1.code,
    l2.code,
    showTranslation,
  );

  const syncedLines = useMemo(() => {
    if (translatedLines.length > 0) {
      return syncLines(translatedLines, l2Lines);
    }
    return l2Lines.map((l) => ({ starttime: l.starttime, l1Line: '', l2Line: l.line }));
  }, [l2Lines, translatedLines]);

  useEffect(() => {
    if (syncedLines.length === 0) { setActiveIndex(-1); return; }
    let idx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (syncedLines[i]!.starttime <= currentTime) idx = i;
      else break;
    }
    setActiveIndex(idx);
  }, [currentTime, syncedLines]);

  const toggleTranslation = () => {
    const next = !showTranslation;
    setShowTranslationState(next);
    setShowTranslation(next);
  };

  if (l2Lines.length === 0) {
    return (
      <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        Subtitles are not available for this video yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={toggleTranslation}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
              showTranslation ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Settings2 className="h-3 w-3" />
            {showTranslation ? 'Translation on' : 'Translation off'}
          </button>
          {translating && (
            <span className="tabular-nums">
              Translating… {progress}/{l2Lines.length}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {syncedLines.map((line, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={i}
              onClick={() => onSeekToLine?.(line.starttime)}
              className={`cursor-pointer rounded-lg px-3 py-2 transition-colors ${
                isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'
              }`}
              ref={isActive ? (el) => {
                if (!el) return;
                const container = scrollContainerRef?.current ?? el.closest('.overflow-y-auto') as HTMLElement | null;
                const cr = container?.getBoundingClientRect();
                const er = el.getBoundingClientRect();
                const vh = window.innerHeight;

                // Determine the visible region: use container if constrained, otherwise viewport
                const top = cr && cr.height < vh * 0.8 ? cr.top : 0;
                const bottom = cr && cr.height < vh * 0.8 ? cr.bottom : vh;
                const margin = (bottom - top) * 0.25; // 25% margin from edges

                // Scroll if line is outside the middle 50% of the visible region
                const nearTop = er.top < top + margin;
                const nearBottom = er.bottom > bottom - margin;
                if (nearTop || nearBottom) {
                  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
              } : undefined}
            >
              <div className={`text-sm ${isActive ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                <TokenizedText
                  text={line.l2Line}
                  l2Code={l2.code}
                  textScale={0.875}
                  context={{
                    text: line.l2Line,
                    starttime: line.starttime,
                    youtube_id: youtubeId,
                    videoTitle,
                  }}
                />
              </div>
              {showTranslation && line.l1Line && (
                <p className={`mt-0.5 text-xs ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
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
