'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useTranscriptAutoScroll } from '@/hooks/use-transcript-auto-scroll';
import { TokenizedText } from '@/components/tokenized-text';
import type { SubtitleLine } from '@langplayer/shared';
import type { TokenCache } from '@langplayer/shared';
import { baseCode } from '@/lib/language-data';
import { syncLines, type SyncedLine } from '@/lib/subtitle-csv';

interface SubtitleDisplayProps {
  youtubeId?: string;
  currentTime: number;
  /** Video title for word-saving context */
  videoTitle?: string;
  /** Pre-computed token cache from /lemmatize-video-normalized */
  tokenCache?: TokenCache;
  /** Whether the token cache has finished loading. When false, TokenizedText
   *  shows plain text and waits — no per-line API calls. */
  tokenCacheLoaded?: boolean;
  /** Called with the array of start times for prev/next line navigation */
  onLinesLoaded?: (startTimes: number[]) => void;
  /** Called when user clicks a subtitle line (outside a word) */
  onSeekToLine?: (starttime: number) => void;
  /** Ref to the scrollable container — when provided, scrolling only happens when line leaves view */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Pre-loaded subtitle lines — if provided, skips the subtitles API fetch */
  initialLines?: SyncedLine[];
  /** Display mode: 'multiline' (default) shows all lines; 'singleline' shows only the active line ± contextLines. */
  mode?: 'multiline' | 'singleline';
  /** In singleline mode, how many context lines to show before and after the active line. Default: 0. */
  contextLines?: number;
  /** Word forms to highlight in the displayed text (e.g. search terms from subs-search). */
  highlightTerms?: string[];
  /** Called when autoPause triggers — the current subtitle line has finished. */
  onPauseLine?: () => void;
  /** Called with translation progress. `null` = not translating. */
  onTranslationProgress?: (text: string | null) => void;
}

/**
 * Strip duration prefix from subtitle text.
 * Raw format: "0.64,来" → "来"
 * Duration is a float + comma prefix, e.g. "1.08," or "0.64,"
 */
function stripDurationPrefix(text: string): string {
  return text.replace(/^[\d.]+,\s*/, '');
}

export function SubtitleDisplay({ youtubeId, currentTime, videoTitle, tokenCache, tokenCacheLoaded, onLinesLoaded, onSeekToLine, scrollContainerRef, initialLines, mode = 'multiline', contextLines = 1, highlightTerms, onPauseLine, onTranslationProgress }: SubtitleDisplayProps) {
  const { l1, l2 } = useLanguage();
  const { display, playback, getL2 } = useSettingsContext();
  const t = useT();
  const l2Code = baseCode(l2.code);
  const l1Code = baseCode(l1.code);
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const isSingleline = mode === 'singleline';
  // In singleline mode, never show translation (lines come from subs-search, not full subtitle track)
  const showTranslation = isSingleline ? false : display.translation;

  useEffect(() => {
    if (initialLines) {
      const l2Only = initialLines.map(l => ({
        line: stripDurationPrefix(l.l2Line),
        starttime: l.starttime,
        duration: l.duration,
      }));
      setL2Lines(l2Only);
      onLinesLoaded?.(l2Only.map(l => l.starttime));
      return;
    }
    // In singleline mode, initialLines is required — don't fetch
    if (isSingleline) return;
    if (!youtubeId) return;
    const fetchSubtitles = async () => {
      const res = await fetch(`/api/videos/${youtubeId}/subtitles?l2=${l2Code}&l1=${l1Code}`);
      if (!res.ok) return;
      const data = await res.json();
      const lines = data.lines?.map((l: SyncedLine) => ({
        line: stripDurationPrefix(l.l2Line ?? ''),
        starttime: l.starttime,
        duration: l.duration,
      })) ?? [];
      setL2Lines(lines);
      onLinesLoaded?.(lines.map((l: SubtitleLine) => l.starttime));
    };
    fetchSubtitles().catch(() => {});
  }, [youtubeId, l2Code, l1Code, initialLines, isSingleline]);

  const { translatedLines, loading: translating, progress } = useSubtitleTranslation(
    l2Lines,
    l1.code,
    l2Code,
    showTranslation,
    activeIndex,
  );
  // retry available on the returned object for error recovery UI (future)

  const syncedLines = useMemo(() => {
    // translatedLines is a sparse array from the lazy translation hook —
    // untranslated positions are undefined. Filter before passing to syncLines.
    const validTranslated = translatedLines.filter((l): l is SubtitleLine => l != null);
    if (validTranslated.length > 0) {
      return syncLines(validTranslated, l2Lines);
    }
    return l2Lines.map((l) => ({ starttime: l.starttime, duration: l.duration, l1Line: '', l2Line: l.line }));
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

  // Auto-scroll to active line.
  // When smoothScroll is OFF: uses browser scrollIntoView (original behavior).
  // When smoothScroll is ON: throttled, eased RAF animation that centers the active line.
  const listRef = useRef<HTMLDivElement>(null);
  useTranscriptAutoScroll({
    activeIndex,
    listRef,
    scrollContainerRef,
    smoothScrollEnabled: playback.smoothScroll,
  });

  // ── Auto-pause ─────────────────────────────────────────────────────────
  const autoPausedRef = useRef<number>(-1);

  // Reset paused-line tracker when the active line changes
  useEffect(() => {
    autoPausedRef.current = -1;
  }, [activeIndex]);

  // Fire onPauseLine when the active line's duration elapses
  useEffect(() => {
    if (!playback.autoPause || activeIndex < 0) return;
    if (autoPausedRef.current === activeIndex) return; // already paused this line

    const line = syncedLines[activeIndex];
    if (!line) return;

    const lineDuration = line.duration
      ?? (syncedLines[activeIndex + 1] ? syncedLines[activeIndex + 1]!.starttime - line.starttime : 5);
    const elapsed = currentTime - line.starttime;

    if (lineDuration > 0 && elapsed >= lineDuration) {
      autoPausedRef.current = activeIndex;
      onPauseLine?.();
    }
  }, [currentTime, activeIndex, syncedLines, playback.autoPause, onPauseLine]);

  // Report translation progress to parent
  useEffect(() => {
    if (translating) {
      onTranslationProgress?.(`${t('subtitle.translating')} ${progress}/${l2Lines.length}`);
    } else {
      onTranslationProgress?.(null);
    }
  }, [translating, progress, l2Lines.length, onTranslationProgress, t]);

  // ── Empty state ──
  if (l2Lines.length === 0) {
    if (isSingleline) {
      return (
        <div className="min-h-[4.5rem] px-4 py-3">
          <p className="text-xs text-muted-foreground/50 italic">
            {t('subtitle.subtitles_unavailable')}
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        {t('subtitle.subtitles_unavailable')}
      </div>
    );
  }

  // ── Singleline mode ──
  if (isSingleline) {
    const activeLine = activeIndex >= 0 ? l2Lines[activeIndex] : null;

    return (
      <div className="min-h-[5rem] px-6 py-4 text-center">
        {activeLine ? (
          <div className="text-xl font-medium leading-relaxed text-center">
            <TokenizedText
              text={activeLine.line}
              l2Code={l2Code}
              textScale={1.5}
              tokenCache={tokenCache}
              tokenCacheLoaded={tokenCacheLoaded}
              highlightForms={highlightTerms}
              context={{
                text: activeLine.line,
                starttime: activeLine.starttime,
                youtube_id: youtubeId,
                videoTitle,
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">
            {t('subtitle.subtitles_unavailable')}
          </p>
        )}
      </div>
    );
  }

  // ── Multiline mode (default) ──
  return (
    <div>
      <div className="space-y-2" ref={listRef}>
        {syncedLines.map((line, i) => {
          const isActive = i === activeIndex;

          // Compute karaoke progress for the active line
          let karaokeProgress: number | undefined;
          if (isActive && playback.karaokeMode) {
            // Duration chain: explicit subtitle duration → next-line gap → 5s fallback for last line
            const lineDuration = line.duration
              ?? (syncedLines[i + 1] ? syncedLines[i + 1]!.starttime - line.starttime : 5);
            karaokeProgress = lineDuration > 0
              ? Math.min(1, Math.max(0, (currentTime - line.starttime) / lineDuration))
              : 0;
          }
          return (
            <div
              key={i}
              data-subtitle-index={i}
              onClick={() => onSeekToLine?.(line.starttime)}
              className={`cursor-pointer rounded-lg px-3 py-2 transition-colors ${
                isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'
              }`}
            >
              <div className={`text-sm ${isActive ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                <TokenizedText
                  text={line.l2Line}
                  l2Code={l2Code}
                  textScale={0.875}
                  tokenCache={tokenCache}
                  tokenCacheLoaded={tokenCacheLoaded}
                  karaokeProgress={karaokeProgress}
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
