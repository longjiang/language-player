'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { getShowPhonetics, setShowPhonetics } from '@/lib/settings';
import { TokenizedText } from '@/components/tokenized-text';
import type { SubtitleLine } from '@langplayer/shared';
import type { TokenCache } from '@langplayer/shared';
import { Settings2 } from 'lucide-react';
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
  initialLines?: { starttime: number; l1Line: string; l2Line: string }[];
  /** Display mode: 'multiline' (default) shows all lines; 'singleline' shows only the active line ± contextLines. */
  mode?: 'multiline' | 'singleline';
  /** In singleline mode, how many context lines to show before and after the active line. Default: 0. */
  contextLines?: number;
  /** Word forms to highlight in the displayed text (e.g. search terms from subs-search). */
  highlightTerms?: string[];
}

/**
 * Strip duration prefix from subtitle text.
 * Raw format: "0.64,来" → "来"
 * Duration is a float + comma prefix, e.g. "1.08," or "0.64,"
 */
function stripDurationPrefix(text: string): string {
  return text.replace(/^[\d.]+,\s*/, '');
}

export function SubtitleDisplay({ youtubeId, currentTime, videoTitle, tokenCache, tokenCacheLoaded, onLinesLoaded, onSeekToLine, scrollContainerRef, initialLines, mode = 'multiline', contextLines = 1, highlightTerms }: SubtitleDisplayProps) {
  const { l1, l2 } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const l2Code = baseCode(l2.code);
  const [l2Lines, setL2Lines] = useState<SubtitleLine[]>([]);
  const [showPhonetics, setShowPhoneticsState] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const isSingleline = mode === 'singleline';
  // In singleline mode, never show translation (lines come from subs-search, not full subtitle track)
  const showTranslation = isSingleline ? false : display.translation;

  useEffect(() => {
    if (initialLines) {
      const l2Only = initialLines.map(l => ({ line: stripDurationPrefix(l.l2Line), starttime: l.starttime }));
      setL2Lines(l2Only);
      onLinesLoaded?.(l2Only.map(l => l.starttime));
      return;
    }
    // In singleline mode, initialLines is required — don't fetch
    if (isSingleline) return;
    if (!youtubeId) return;
    const fetchSubtitles = async () => {
      const res = await fetch(`/api/videos/${youtubeId}/subtitles?l2=${l2Code}`);
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
  }, [youtubeId, l2Code, initialLines, isSingleline]);

  useEffect(() => {
    setShowPhoneticsState(getShowPhonetics());
  }, []);

  const { translatedLines, loading: translating, progress } = useSubtitleTranslation(
    l2Lines,
    l1.code,
    l2Code,
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

  // Auto-scroll to active line — only when activeIndex changes, not on every render
  const prevActiveRef = useRef(activeIndex);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIndex === prevActiveRef.current) return;
    prevActiveRef.current = activeIndex;
    if (activeIndex < 0) return;

    const el = listRef.current?.querySelector(`[data-subtitle-index="${activeIndex}"]`) as HTMLElement | null;
    if (!el) return;

    const container = scrollContainerRef?.current ?? el.closest('.overflow-y-auto') as HTMLElement | null;
    const cr = container?.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const vh = window.innerHeight;

    const top = cr && cr.height < vh * 0.8 ? cr.top : 0;
    const bottom = cr && cr.height < vh * 0.8 ? cr.bottom : vh;
    const margin = (bottom - top) * 0.25;

    const nearTop = er.top < top + margin;
    const nearBottom = er.bottom > bottom - margin;
    if (nearTop || nearBottom) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIndex, scrollContainerRef]);

  const toggleTranslation = () => {
    updateDisplay({ translation: !showTranslation });
  };

  const togglePhonetics = () => {
    const next = !showPhonetics;
    setShowPhoneticsState(next);
    setShowPhonetics(next);
  };

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
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={toggleTranslation}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
              showTranslation ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Settings2 className="h-3 w-3" />
            {showTranslation ? t('subtitle.translation_on') : t('subtitle.translation_off')}
          </button>
          <button
            onClick={togglePhonetics}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
              showPhonetics ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {showPhonetics ? 'あ' : 'a'}
            {t('label.show_phonetics')}
          </button>
          {translating && (
            <span className="tabular-nums">
              {t('subtitle.translating')} {progress}/{l2Lines.length}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2" ref={listRef}>
        {syncedLines.map((line, i) => {
          const isActive = i === activeIndex;
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
