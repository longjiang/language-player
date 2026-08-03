'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useSubtitleTranslation, isLineInTranslationLookahead } from '@/hooks/use-subtitle-translation';
import { useCaptionNormalization } from '@/hooks/use-caption-normalization';
import { useTranscriptAutoScroll } from '@/hooks/use-transcript-auto-scroll';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { useTextScale } from '@/hooks/use-text-scale';
import type { SubtitleLine } from '@langplayer/shared';
import type { TokenCache } from '@langplayer/shared';
import { findActiveLineIndex } from '@langplayer/shared';
import { baseCode } from '@/lib/language-data';
import {
  syncLines,
  stripSubtitleDurationPrefix,
  extractSubtitleDuration,
  type SyncedLine,
} from '@/lib/subtitle-csv';

/** Karaoke lead: bias the highlight slightly ahead of the caption clock, since
 *  caption start times often trail the audio by a few hundred milliseconds. */
const KARAOKE_LEAD_SECONDS = 0.15;

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
  /** True when the transcript is YouTube auto-generated (ASR) — enables
   *  progressive SPEC-029 caption normalization (raw-first, then cleaned in
   *  chunks near the playhead). */
  isGenerated?: boolean;
  /** Sparse overlay of cleaned caption text (index → text, undefined = still
   *  raw). When provided, normalization is owned by the parent and this
   *  component only applies the overlay. */
  normalizedOverlay?: (string | null | undefined)[];
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

/** First search form that appears in this line — sent as the server-side
 *  highlight term so the emphasis lands on the right word in the translation. */
function firstMatchingForm(line: string, terms: string[] | undefined): string | undefined {
  if (!terms?.length) return undefined;
  const lower = line.toLowerCase();
  return terms
    .map((f) => f.trim())
    .filter(Boolean)
    .find((f) => lower.includes(f.toLowerCase()));
}

export function SubtitleDisplay({ youtubeId, currentTime, videoTitle, tokenCache, tokenCacheLoaded, onLinesLoaded, onSeekToLine, scrollContainerRef, initialLines, isGenerated, normalizedOverlay, mode = 'multiline', contextLines = 1, highlightTerms, onPauseLine, onTranslationProgress }: SubtitleDisplayProps) {
  const { l1, l2 } = useLanguage();
  const { display, playback, getL2 } = useSettingsContext();
  // Scale the design sizes by the user's text-size setting (zoom index 0 = 1×).
  const textZoomFactor = useTextScale();
  const t = useT();
  const l2Code = baseCode(l2.code);
  const l1Code = baseCode(l1.code);
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [fetchedIsGenerated, setFetchedIsGenerated] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const isSingleline = mode === 'singleline';
  const showTranslation = display.translation;

  useEffect(() => {
    if (initialLines) {
      const l2Only = initialLines.map(l => ({
        line: stripSubtitleDurationPrefix(l.l2Line),
        starttime: l.starttime,
        duration: extractSubtitleDuration(l),
      }));
      setL2Lines(l2Only);
      onLinesLoaded?.(l2Only.map(l => l.starttime));
      return;
    }
    // In singleline mode, initialLines is required — don't fetch
    if (isSingleline) return;
    if (!youtubeId) return;
    setFetchedIsGenerated(false);
    const fetchSubtitles = async () => {
      // clean_generated=0 keeps auto-generated captions raw so normalization
      // can run progressively on the client (SPEC-029).
      const res = await fetch(`/api/videos/${youtubeId}/subtitles?l2=${l2Code}&l1=${l1Code}&clean_generated=0`);
      if (!res.ok) return;
      const data = await res.json();
      setFetchedIsGenerated(data?.isGenerated === true);
      const lines = data.lines?.map((l: SyncedLine) => ({
        line: stripSubtitleDurationPrefix(l.l2Line ?? ''),
        starttime: l.starttime,
        duration: extractSubtitleDuration(l),
      })) ?? [];
      setL2Lines(lines);
      onLinesLoaded?.(lines.map((l: SubtitleLine) => l.starttime));
    };
    fetchSubtitles().catch(() => {});
  }, [youtubeId, l2Code, l1Code, initialLines, isSingleline]);

  const lineHighlightForms = useMemo(
    () => l2Lines.map((l) => firstMatchingForm(l.line, highlightTerms)),
    [l2Lines, highlightTerms],
  );

  // ── Progressive caption normalization (SPEC-029) ──
  // Only auto-generated transcripts are normalized, and only when the parent
  // hasn't already taken ownership by passing a normalizedOverlay (e.g. the
  // watch page, which also feeds the subtitles-mode band).
  const effectiveIsGenerated = isGenerated ?? fetchedIsGenerated;
  const { normalizedLines: ownNormalizedLines } = useCaptionNormalization({
    youtubeId,
    l2Code,
    lines: l2Lines,
    enabled: !normalizedOverlay && effectiveIsGenerated && !!youtubeId && l2Lines.length > 0,
    activeIndex,
  });
  const captionOverlay = normalizedOverlay ?? ownNormalizedLines;

  // Raw lines with the cleaned overlay swapped in. Identity is preserved when
  // nothing changed so dependent memos don't churn.
  const effectiveL2Lines = useMemo(() => {
    if (!captionOverlay || captionOverlay.length === 0) return l2Lines;
    let changed = false;
    const merged = l2Lines.map((l, i) => {
      const cleaned = captionOverlay[i];
      if (cleaned && cleaned !== l.line) {
        changed = true;
        return { ...l, line: cleaned };
      }
      return l;
    });
    return changed ? merged : l2Lines;
  }, [l2Lines, captionOverlay]);

  const { translatedLines, loading: translating, progress, error, retry } = useSubtitleTranslation(
    l2Lines,
    l1.code,
    l2Code,
    showTranslation,
    activeIndex,
    lineHighlightForms,
  );

  const syncedLines = useMemo(() => {
    // translatedLines is a sparse array from the lazy translation hook —
    // untranslated positions are undefined. Filter before passing to syncLines.
    const validTranslated = translatedLines.filter((l): l is SubtitleLine => l != null);
    if (validTranslated.length > 0) {
      return syncLines(validTranslated, effectiveL2Lines);
    }
    return effectiveL2Lines.map((l) => ({ starttime: l.starttime, duration: l.duration, l1Line: '', l2Line: l.line }));
  }, [effectiveL2Lines, translatedLines]);

  useEffect(() => {
    const startTimes = syncedLines.map(l => l.starttime);
    setActiveIndex(findActiveLineIndex(startTimes, currentTime));
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
    const activeLine = activeIndex >= 0 ? effectiveL2Lines[activeIndex] : null;
    const activeTranslation = activeIndex >= 0 ? translatedLines[activeIndex] : null;

    return (
      <div className="min-h-[5rem] py-4">
        {error && showTranslation && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            <span className="text-destructive">{t('msg.translation_failed')}</span>
            <button
              onClick={retry}
              className="rounded-md bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/30 transition-colors"
            >
              {t('action.retry')}
            </button>
          </div>
        )}
        {activeLine ? (
          <TextActionMenu
            text={activeLine.line}
            l2Code={l2Code}
            l1Code={l1Code}
            translation={
              showTranslation && activeTranslation ? (
                <div style={{ fontSize: `${0.875 * textZoomFactor}rem` }}>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => (
                        <mark className="rounded bg-primary/15 px-0.5 font-semibold text-primary ring-1 ring-primary/30">
                          {children}
                        </mark>
                      ),
                    }}
                  >
                    {activeTranslation.line}
                  </ReactMarkdown>
                </div>
              ) : undefined
            }
            translationClass="text-sm text-center"
            translationBelow
            loading={showTranslation && translating && !activeTranslation}
          >
            <div className="text-center text-xl font-medium leading-relaxed">
              <TokenizedText
                text={activeLine.line}
                l2Code={l2Code}
                textScale={1.5 * textZoomFactor}
                tokenCache={tokenCache}
                tokenCacheLoaded={tokenCacheLoaded}
                highlightForms={highlightTerms}
                selectionDictionary
                context={{
                  starttime: activeLine.starttime,
                  youtube_id: youtubeId,
                  videoTitle,
                }}
              />
            </div>
          </TextActionMenu>
        ) : (
          <p className="text-center text-sm text-muted-foreground/50 italic">
            {t('subtitle.subtitles_unavailable')}
          </p>
        )}
      </div>
    );
  }

  // ── Multiline mode (default) ──
  return (
    <div>
      {error && showTranslation && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          <span className="text-destructive">{t('msg.translation_failed')}</span>
          <button
            onClick={retry}
            className="rounded-md bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/30 transition-colors"
          >
            {t('action.retry')}
          </button>
        </div>
      )}
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
              ? Math.min(1, Math.max(0, (currentTime - line.starttime + KARAOKE_LEAD_SECONDS) / lineDuration))
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
                  textScale={0.875 * textZoomFactor}
                  tokenCache={tokenCache}
                  tokenCacheLoaded={tokenCacheLoaded}
                  karaokeProgress={karaokeProgress}
                  selectionDictionary
                  context={{
                    starttime: line.starttime,
                    youtube_id: youtubeId,
                    videoTitle,
                  }}
                />
              </div>
              {showTranslation && line.l1Line && (
                <p
                  className={`mt-0.5 text-xs leading-relaxed ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}
                  style={{ fontSize: `${0.75 * textZoomFactor}rem` }}
                >
                  {line.l1Line}
                </p>
              )}
              {showTranslation && !line.l1Line && translating && isLineInTranslationLookahead(i, activeIndex) && (
                <TranslationSkeleton text={line.l2Line} className="mt-0.5" barClassName="h-2.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
