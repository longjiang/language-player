'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { languageName, baseCode } from '@/lib/language-data';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useStreamingExplanation, type StreamDiagnostics } from '@langplayer/api-client';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { log, logwarn } from '@/lib/logger';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import { MarkdownExplanation } from '@/components/markdown-explanation';
import { SubsSearchRow, type SubsSearchRowSegment, formatTime } from '@/components/video/subs-search-row';
import { YouTubePlayer, type YouTubePlayerHandle, PLAYER_STATES } from '@/components/video/youtube-player';
import { VideoControlBar } from '@/components/video/video-control-bar';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import { VideoSidebarPanel, type SidebarTabKey } from '@/components/video/video-sidebar-panel';
import {
  parseSubsL2,
  findMatchLine,
  durationToSeconds,
  buildAiExamplesPayload,
  buildAiExamplesPrompt,
  parseAiExamplesResponse,
} from '@langplayer/utils';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
  Copy,
  Play,
  X,
  FileText,
  Info,
  Eye,
  Clock,
  Calendar,
} from 'lucide-react';

type FollowUpKind = 'inflection' | 'morphemes' | 'etymology' | 'syntax' | 'synonyms' | 'examples';

const FOLLOW_UPS: { kind: FollowUpKind; labelKey: string }[] = [
  { kind: 'inflection', labelKey: 'action.inflection' },
  { kind: 'morphemes', labelKey: 'action.morphemes' },
  { kind: 'etymology', labelKey: 'action.etymology' },
  { kind: 'syntax', labelKey: 'action.syntax' },
  { kind: 'synonyms', labelKey: 'action.synonyms' },
  { kind: 'examples', labelKey: 'title.examples_from_videos' },
];

/** One AI-selected video example: the search result (for the chip) plus the
 *  LLM's explanation of the word's usage in that line. */
interface AiVideoExampleData {
  video: SubsSearchVideo;
  explanation: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Translated label shown in the user bubble (follow-up buttons only). */
  label?: string;
  /** The exact prompt that produced this assistant message (for regenerate). */
  prompt?: string;
  /** AI-selected video examples ("Examples from Videos" follow-up): rendered
   *  as subs-search-style chips, each followed by the explanation. */
  examples?: AiVideoExampleData[];
  /** True while the "Examples from Videos" follow-up is fetching/analyzing
   *  (non-streaming request — shows a spinner in the assistant bubble). */
  loading?: boolean;
}

interface AiExplanationProps {
  /** The word being looked up (lemma/dictionary form). */
  word: string;
  /** The surrounding context sentence (the subtitle line). */
  contextText?: string;
  /** The inflected form of the word as it appears in the context text. */
  contextForm?: string;
  /** Whether the entry was found in the dictionary (affects prompt wording). */
  entryFound: boolean;
  /** When true, streams the explanation immediately without showing a button. */
  autoLoad?: boolean;
}

// ── Subs-search helpers (mirror subs-search-results.tsx) ──

function lineHasAnyTerm(line: string, terms: string[]): boolean {
  const lower = line.toLowerCase();
  return terms.some((f) => lower.includes(f.trim().toLowerCase()));
}

/** The first search form that appears in this line (used as the server-side
 *  highlight form so the emphasis lands on the right word in the translation). */
function firstMatchingForm(line: string, terms: string[]): string | undefined {
  const lower = line.toLowerCase();
  return terms
    .map((f) => f.trim())
    .filter(Boolean)
    .find((f) => lower.includes(f.toLowerCase()));
}

/** Compact number label (e.g. "12K") with a plain fallback. */
function formatNumber(n: number | undefined, locale: string): string {
  if (!n) return '';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/**
 * "Let DeepSeek Explain" — Pro-only feature shown in the dictionary popup.
 *
 * Matches Classic + GO behaviour:
 * - Free users see an upgrade prompt
 * - Pro users get an AI explanation of the word in context
 * - The prompt asks for a succinct explanation plus 2 translated examples
 */
export function AiExplanation({ word, contextText, contextForm, entryFound, autoLoad = false }: AiExplanationProps) {
  const { data: session } = useSession();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { isPro, loaded: subLoaded } = useSubscriptionContext();
  const { display } = useSettingsContext();

  const [showAi, setShowAi] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<Set<FollowUpKind>>(new Set());
  const messageIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialStreamStartedRef = useRef(false);
  const prevWordRef = useRef(word);
  const loggedEmptyBubbleRef = useRef<Set<number>>(new Set());
  /** Id of the latest empty assistant placeholder, if any (for retries). */
  const emptyAssistantIdRef = useRef<number | null>(null);

  // ── "Examples from Videos" player modal state ──
  // Mirrors the subs-search playback modal: a mini player with controls and
  // the subtitles display (singleline | multiline). Opened by tapping an
  // example chip in the AI chat.
  const examplePlayerRef = useRef<YouTubePlayerHandle>(null);
  const [examplePlayerIndex, setExamplePlayerIndex] = useState<number | null>(null);
  const [exampleTime, setExampleTime] = useState(0);
  const [exampleDuration, setExampleDuration] = useState(0);
  const [examplePaused, setExamplePaused] = useState(true);
  const [exampleMode, setExampleMode] = useState<'singleline' | 'multiline'>('singleline');
  const [examplePanelTab, setExamplePanelTab] = useState<SidebarTabKey>('subs');
  const exampleSidebarRef = useRef<HTMLDivElement>(null);

  // Wide = landscape (width > height), matching the watch page's definition.
  // When wide + multiline, the example player modal shows subtitles on the
  // side and the video info below the player, like the watch page — inside
  // the modal.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const check = () => setIsWide(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // SSE-level diagnostics for the shared streaming hook — reveals whether an
  // empty bubble came from an empty server response, malformed SSE, an HTTP
  // error, or something else, without adding app-specific logging to
  // packages/api-client.
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation(
    useCallback(
      (d: StreamDiagnostics) => {
        const base = {
          word,
          chars: d.chars,
          sseLines: d.sseLines,
          parsedChunks: d.parsedChunks,
          skippedPayloads: d.skippedPayloads,
          malformedLines: d.malformedLines,
          sawDone: d.sawDone,
          httpStatus: d.httpStatus,
          durationMs: d.durationMs,
          error: d.error,
        };
        if (d.error) {
          logwarn('AI explain stream diagnostics (error)', base);
        } else if (d.chars === 0) {
          logwarn('AI explain stream diagnostics (EMPTY, no error)', base);
        } else {
          log('AI explain stream diagnostics', base);
        }
      },
      [word],
    ),
  );

  const appendMessage = useCallback((message: Omit<ChatMessage, 'id'>) => {
    const id = messageIdRef.current++;
    setMessages((prev) => [...prev, { ...message, id }]);
    if (message.role === 'assistant' && !message.text) {
      emptyAssistantIdRef.current = id;
    }
    return id;
  }, []);

  const updateMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if (next.role === 'assistant') {
          if (next.text) {
            if (emptyAssistantIdRef.current === id) emptyAssistantIdRef.current = null;
          } else {
            emptyAssistantIdRef.current = id;
          }
        }
        return next;
      }),
    );
  }, []);

  // Build the prompt: succinct explanation of the word in context, then 2
  // examples with translations. The backtick instruction is appended so L2
  // strings render as interactive tokenized text in MarkdownExplanation.
  const buildPrompt = useCallback((): string => {
    // L2 name in the L1 language (e.g., "Japanese" for en, "日语" for zh-Hans)
    const l2Name = languageName(l2.code, l1.code);

    // Strip trailing punctuation from context to avoid doubled periods
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;

    let prompt: string;
    if (cleanContext && contextForm && contextForm !== word) {
      prompt = t('prompt.explain_word_context_form', { l2Name, word, contextForm, context: cleanContext });
    } else if (cleanContext) {
      prompt = t('prompt.explain_word_context', { l2Name, word, context: cleanContext });
    } else {
      prompt = t('prompt.explain_word', { l2Name, word });
    }

    // L2 strings are backticked so they render as interactive tokenized text
    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [
    t,
    l1.code,
    l2.code,
    word,
    contextText,
    contextForm,
  ]);

  const fetchExplanation = useCallback(() => {
    const prompt = buildPrompt();
    // Reuse the latest empty assistant placeholder (e.g. retry after an error
    // or StrictMode's double-mount abort) instead of stacking a new message.
    // Tracked in a ref because the StrictMode second effect pass re-runs this
    // callback with a stale `messages` closure.
    const existingEmptyId = emptyAssistantIdRef.current;
    let targetId: number;
    if (existingEmptyId !== null) {
      targetId = existingEmptyId;
      updateMessage(targetId, { text: '', prompt });
    } else {
      targetId = appendMessage({ role: 'assistant', text: '', prompt });
    }
    setStreamingId(targetId);
    log('AI explain stream start', {
      word,
      targetId,
      reusing: existingEmptyId !== null,
    });
    stream(prompt);
  }, [stream, buildPrompt, word, appendMessage, updateMessage]);

  const handleRegenerate = useCallback((messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    const prompt = target.prompt ?? buildPrompt();
    updateMessage(messageId, { text: '', prompt });
    setStreamingId(messageId);
    log('AI explain stream start (regenerate)', { word, messageId });
    stream(prompt, { regenerate: true });
  }, [stream, buildPrompt, word, messages, updateMessage]);

  const buildFollowUpPrompt = useCallback((kind: FollowUpKind): string => {
    const l2Name = languageName(l2.code, l1.code);

    // Strip trailing punctuation from context to avoid doubled periods
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;

    const wordParams = { l2Name, word };
    let prompt: string;
    if (kind === 'inflection') {
      if (cleanContext && contextForm && contextForm !== word) {
        prompt = t('prompt.followup_inflection_context_form', { ...wordParams, contextForm, context: cleanContext });
      } else if (cleanContext) {
        prompt = t('prompt.followup_inflection_context', { ...wordParams, context: cleanContext });
      } else {
        prompt = t('prompt.followup_inflection', wordParams);
      }
    } else if (kind === 'morphemes') {
      prompt = cleanContext
        ? t('prompt.followup_morphemes_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_morphemes', wordParams);
    } else if (kind === 'etymology') {
      prompt = t('prompt.followup_etymology', wordParams);
    } else if (kind === 'syntax') {
      prompt = cleanContext
        ? t('prompt.followup_syntax_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_syntax', wordParams);
    } else {
      // synonyms
      prompt = cleanContext
        ? t('prompt.followup_synonyms_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_synonyms', wordParams);
    }

    // L2 strings are backticked so they render as interactive tokenized text
    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [t, l1.code, l2.code, word, contextText, contextForm]);

  // ── "Examples from Videos" follow-up ──
  // 1. Search subtitles (limit 50) for the word being explained.
  // 2. Feed a succinct payload (≤3 subtitle lines per video) to the LLM.
  // 3. The LLM replies with strict JSON: { examples: [{ video_id, explanation }] }.
  // 4. The client maps ids back to the fetched results and renders the chips
  //    (the same SubsSearchRow component the results list uses, translations
  //    included), each followed by the LLM's explanation.
  const fetchSubsSearch = useCallback(
    async (term: string): Promise<SubsSearchVideo[]> => {
      const res = await fetch(
        `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(term)}&l2=${baseCode(l2.code)}&limit=50&context=3`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any[] = await res.json();
      if (!Array.isArray(data)) return [];
      return data
        .map((v: any) => {
          const lines = parseSubsL2(v.subs_l2 ?? '');
          return {
            id: v.id,
            title: v.title ?? '',
            youtube_id: v.youtube_id,
            subs_l2: lines,
            views: v.views,
            duration: durationToSeconds(v.duration),
            date: v.date,
            category: v.category != null ? Number(v.category) : null,
            tv_show: v.tv_show != null ? Number(v.tv_show) : null,
            matchLineIndex: findMatchLine(lines, term),
          };
        })
        .filter((v) => v.subs_l2.length > 0 && v.matchLineIndex >= 0);
    },
    [l2.code],
  );

  const handleExamplesFollowUp = useCallback(async () => {
    setUsedFollowUps((prev) => {
      const next = new Set(prev);
      next.add('examples');
      return next;
    });
    appendMessage({ role: 'user', text: '', label: t('title.examples_from_videos') });
    const aiId = appendMessage({ role: 'assistant', text: '', loading: true });
    log('AI examples follow-up start', { word });
    try {
      // Include the inflected surface form too, so inflected occurrences match.
      const searchTerms =
        contextForm && contextForm !== word ? `${word},${contextForm}` : word;
      const results = await fetchSubsSearch(searchTerms);
      if (results.length === 0) throw new Error('no subs-search results');

      const l1Name = languageName(l1.code, l1.code);
      const l2Name = languageName(l2.code, l1.code);
      const lines = buildAiExamplesPayload(results);
      const prose = t('prompt.subs_ai_examples', {
        n: results.length,
        l2Name,
        term: word,
      });
      const prompt = buildAiExamplesPrompt({ prose, lines, l1Name, l2Name, term: word });
      log('AI examples follow-up request', {
        word,
        n: results.length,
        promptChars: prompt.length,
      });

      const res = await fetch(`${PYTHON_API_URL}/chatgpt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, cache: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      if (data?.status !== 'success' || typeof data.response !== 'string') {
        throw new Error('bad /chatgpt response');
      }
      const parsed = parseAiExamplesResponse(data.response);
      if (!parsed) throw new Error('unparseable AI examples response');

      const byId = new Map(results.map((v) => [v.id, v]));
      const examples: AiVideoExampleData[] = parsed.examples
        .map((e) => {
          const video = byId.get(e.videoId);
          return video ? { video, explanation: e.explanation } : null;
        })
        .filter((e): e is AiVideoExampleData => e !== null);
      if (examples.length === 0) throw new Error('no examples matched to results');

      updateMessage(aiId, {
        text: t('msg.examples_from_videos_intro'),
        examples,
        loading: false,
      });
      log('AI examples follow-up applied', { word, n: examples.length });
    } catch (err) {
      logwarn('AI examples follow-up failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      updateMessage(aiId, { text: t('msg.ai_examples_failed'), loading: false });
    }
  }, [word, contextForm, l1.code, l2.code, t, appendMessage, updateMessage, fetchSubsSearch]);

  const handleFollowUp = useCallback((kind: FollowUpKind) => {
    if (kind === 'examples') {
      void handleExamplesFollowUp();
      return;
    }
    const followUp = FOLLOW_UPS.find((f) => f.kind === kind);
    const prompt = buildFollowUpPrompt(kind);
    setUsedFollowUps((prev) => {
      const next = new Set(prev);
      next.add(kind);
      return next;
    });
    const userId = appendMessage({
      role: 'user',
      text: '',
      label: followUp ? t(followUp.labelKey) : '',
    });
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    log('AI explain follow-up stream start', { word, kind });
    stream(prompt);
  }, [buildFollowUpPrompt, stream, word, appendMessage, t, handleExamplesFollowUp]);

  // ── Example chips: lazy translations (same pipeline as the results list) ──
  const examplesMessage = useMemo(
    () => messages.find((m) => m.examples && m.examples.length > 0),
    [messages],
  );
  const exampleVideos = useMemo(
    () => examplesMessage?.examples ?? [],
    [examplesMessage],
  );
  const exampleSegments = useMemo(
    () =>
      exampleVideos.map((ex) => {
        const ml = ex.video.subs_l2[ex.video.matchLineIndex];
        const segs: SubsSearchRowSegment[] = [];
        const match = ml?.line ?? '';
        if (match) segs.push({ text: match, hasTerm: lineHasAnyTerm(match, [word]) });
        return segs;
      }),
    [exampleVideos, word],
  );
  const exampleTranslationInput = useMemo(() => {
    const lines: SubtitleLine[] = [];
    const forms: (string | undefined)[] = [];
    const rowStarts: number[] = [];
    for (const segs of exampleSegments) {
      rowStarts.push(lines.length);
      for (const seg of segs) {
        lines.push({ line: seg.text, starttime: 0 });
        forms.push(seg.hasTerm ? firstMatchingForm(seg.text, [word]) : undefined);
      }
    }
    return { lines, forms, rowStarts };
  }, [exampleSegments, word]);
  const {
    translatedLines: exampleTranslations,
    loading: exampleTranslating,
  } = useSubtitleTranslation(
    exampleTranslationInput.lines,
    l1.code,
    baseCode(l2.code),
    display.translation && exampleTranslationInput.lines.length > 0,
    0,
    exampleTranslationInput.forms,
  );

  // ── Example player modal (mirrors the subs-search playback modal) ──
  const exampleVideo =
    examplePlayerIndex !== null ? (exampleVideos[examplePlayerIndex]?.video ?? null) : null;
  const exampleMatchLine = exampleVideo?.subs_l2[exampleVideo.matchLineIndex] ?? null;
  const exampleDefaultLine = exampleMatchLine
    ? { starttime: exampleMatchLine.starttime, line: exampleMatchLine.line }
    : undefined;
  const exampleInitialLines = useMemo(() => {
    const lines =
      exampleVideo?.subs_l2.map((l) => ({
        starttime: l.starttime,
        l1Line: '',
        l2Line: l.line,
      })) ?? [];
    lines.sort((a, b) => a.starttime - b.starttime);
    return lines;
  }, [exampleVideo?.subs_l2]);

  // Lightweight current-video info (SubsSearchVideo has no
  // likes/comments/difficulty, so a full VideoMeta isn't possible). Shown in
  // the info tab (narrow) and below the player on wide screens in multiline
  // mode (watch-page layout).
  const exampleVideoInfoContent = exampleVideo ? (
    <div className="space-y-3">
      <h2 className="text-base font-bold leading-tight">{exampleVideo.title}</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {exampleVideo.views != null && (
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {t('label.views_count', { count: formatNumber(exampleVideo.views, l1.code) })}
          </span>
        )}
        {exampleVideo.duration != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatTime(exampleVideo.duration)}
          </span>
        )}
        {exampleVideo.date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(exampleVideo.date).toLocaleDateString(l1.code)}
          </span>
        )}
      </div>
      <Link
        href={`/${l1.code}/${l2.code}/watch/${exampleVideo.youtube_id}`}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted transition-colors"
      >
        <Play className="h-3.5 w-3.5" />
        {t('action.watch')}
      </Link>
    </div>
  ) : null;

  const openExamplePlayer = useCallback((index: number) => {
    setExamplePlayerIndex(index);
    setExampleTime(0);
    setExamplePanelTab('subs');
  }, []);

  const closeExamplePlayer = useCallback(() => {
    setExamplePlayerIndex(null);
    setExampleTime(0);
  }, []);

  const handleExampleTimeUpdate = useCallback((time: number) => setExampleTime(time), []);
  const handleExampleDuration = useCallback((d: number) => setExampleDuration(d), []);
  const handleExampleStateChange = useCallback((state: number) => {
    setExamplePaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);
  const toggleExampleMode = useCallback(() => {
    setExampleMode((m) => (m === 'singleline' ? 'multiline' : 'singleline'));
    setExamplePanelTab('subs');
  }, []);
  const goToExamplePreviousVideo = useCallback(() => {
    if (examplePlayerIndex !== null && examplePlayerIndex > 0) {
      setExamplePlayerIndex((i) => (i === null ? null : i - 1));
    }
  }, [examplePlayerIndex]);
  const goToExampleNextVideo = useCallback(() => {
    if (examplePlayerIndex !== null && examplePlayerIndex < exampleVideos.length - 1) {
      setExamplePlayerIndex((i) => (i === null ? null : i + 1));
    }
  }, [examplePlayerIndex, exampleVideos.length]);
  const goToExamplePreviousLine = useCallback(() => {
    if (!exampleVideo) return;
    const subs = exampleVideo.subs_l2;
    for (let i = subs.length - 1; i >= 0; i--) {
      if (subs[i]!.starttime < exampleTime - 0.3) {
        examplePlayerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  }, [exampleTime, exampleVideo]);
  const goToExampleNextLine = useCallback(() => {
    if (!exampleVideo) return;
    const subs = exampleVideo.subs_l2;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i]!.starttime > exampleTime + 0.3) {
        examplePlayerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  }, [exampleTime, exampleVideo]);
  const exampleHasPrevLine = useMemo(() => {
    if (!exampleVideo) return false;
    return exampleVideo.subs_l2.some((l) => l.starttime < exampleTime - 0.3);
  }, [exampleVideo, exampleTime]);
  const exampleHasNextLine = useMemo(() => {
    if (!exampleVideo) return false;
    return exampleVideo.subs_l2.some((l) => l.starttime > exampleTime + 0.3);
  }, [exampleVideo, exampleTime]);

  const handleCopy = useCallback(async (messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    const text = target?.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      log('AI explain copy failed', { error: err });
    }
  }, [messages]);

  // Abort the in-flight stream when the component unmounts (also neutralizes
  // React StrictMode's double-mounted effect: the first fetch is aborted before
  // the second runs, so only one stream proceeds).
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    reset();
    // StrictMode runs this cleanup between the double-mounted effect passes.
    // Reset the one-shot guard so the second pass re-fetches instead of
    // stranding the aborted empty placeholder (an empty bubble with no
    // regenerate/copy buttons). The re-fetch reuses that placeholder.
    initialStreamStartedRef.current = false;
  }, [reset]);

  // When the same component instance is reused for a new dictionary entry,
  // drop the old transcript so the new word can auto-fetch again.
  useEffect(() => {
    if (prevWordRef.current === word) return;
    prevWordRef.current = word;
    initialStreamStartedRef.current = false;
    loggedEmptyBubbleRef.current = new Set();
    emptyAssistantIdRef.current = null;
    setMessages([]);
    setStreamingId(null);
    setUsedFollowUps(new Set());
    reset();
  }, [word, reset]);

  // Mirror the streaming hook's text into the assistant message being streamed
  useEffect(() => {
    if (streamingId === null) return;
    updateMessage(streamingId, { text: explanation });
  }, [explanation, streamingId, updateMessage]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current) {
      if (!explanation && !error) {
        logwarn('AI explain stream finished EMPTY without error', {
          word,
          chars: explanation.length,
        });
      } else {
        log('AI explain stream finished', {
          word,
          chars: explanation.length,
          error: error ?? undefined,
        });
      }
      wasLoadingRef.current = false;
      setStreamingId(null);
    }
  }, [loading, explanation, error, word]);

  // Fetch when "show AI" is toggled on, or when autoLoad + Pro status resolve
  useEffect(() => {
    if ((showAi || autoLoad) && isPro && subLoaded && !explanation && !loading) {
      if (initialStreamStartedRef.current) return;
      initialStreamStartedRef.current = true;
      fetchExplanation();
    }
  }, [showAi, autoLoad, isPro, subLoaded, explanation, loading, fetchExplanation]);

  // Pro gate — free user (skip the gate while still loading — show the button optimistically)
  if (subLoaded && !isPro && (showAi || autoLoad)) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-800 dark:bg-amber-950">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          {t('msg.ai_pro_feature')}
        </p>
      </div>
    );
  }

  // Waiting for subscription check after user clicked — show spinner
  if (!subLoaded && (showAi || autoLoad)) {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('msg.getting_ai_response')}
        </div>
      </div>
    );
  }

  // Not yet toggled — always show the button (don't wait for subscription check)
  if (!showAi && !autoLoad) {
    return (
      <div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => setShowAi(true)}
        >
          <Sparkles className="h-4 w-4" />
          {t('action.let_ai_explain')}
        </Button>
      </div>
    );
  }

  // Loading (no tokens yet) — only before the first assistant placeholder exists
  if (loading && !explanation && messages.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('msg.getting_ai_response')}
        </div>
      </div>
    );
  }

  // Streaming or complete — show the chat transcript
  if (messages.length > 0 || loading || error) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          {t('label.ai_says')}
          {loading && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
        </div>

        <div className="space-y-3">
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {message.label}
                </div>
              </div>
            ) : (
              (() => {
                const streamingThis = loading && message.id === streamingId;
                const examplesLoading = Boolean(message.loading);
                if (
                  !message.text &&
                  !streamingThis &&
                  !examplesLoading &&
                  !message.examples &&
                  !loggedEmptyBubbleRef.current.has(message.id)
                ) {
                  loggedEmptyBubbleRef.current.add(message.id);
                  logwarn('AI explain rendered empty assistant bubble', {
                    id: message.id,
                    word,
                    loading,
                    streamingId,
                    error: error ?? undefined,
                    messages: messages.length,
                  });
                }
                const isExamplesMessage = (message.examples?.length ?? 0) > 0;
                return (
                  <div key={message.id} className="flex justify-start">
                    <div className="max-w-[95%]">
                      <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2">
                    {examplesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('msg.getting_ai_response')}
                      </div>
                    ) : loading && message.id === streamingId && !message.text ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : message.text ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
                        <MarkdownExplanation
                          text={message.text}
                          l2Code={l2.code}
                          streaming={loading && message.id === streamingId}
                        />
                      </div>
                    ) : null}
                    {isExamplesMessage && (
                      <div className="mt-2 space-y-2">
                        {message.examples!.map((ex, i) => (
                          <div key={ex.video.id}>
                            <SubsSearchRow
                              video={ex.video}
                              index={i}
                              isActive={false}
                              onSelect={() => openExamplePlayer(i)}
                              segments={exampleSegments[i] ?? []}
                              highlightTerms={[word]}
                              showTranslation={display.translation}
                              translationStart={exampleTranslationInput.rowStarts[i] ?? 0}
                              translations={exampleTranslations}
                              translating={exampleTranslating}
                              firstLineIndex={0}
                            />
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {ex.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.text || (loading && message.id === streamingId) || examplesLoading || isExamplesMessage ? (
                    <div className="mt-1 flex items-center gap-1 pl-1">
                      {!isExamplesMessage && (
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          aria-label={t('action.regenerate')}
                          title={t('action.regenerate')}
                          disabled={loading}
                          onClick={() => handleRegenerate(message.id)}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        aria-label={t('action.copy')}
                        title={t('action.copy')}
                        disabled={loading || examplesLoading}
                        onClick={() => handleCopy(message.id)}
                      >
                        {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                      ) : null}
                    </div>
                  </div>
                );
              })()
            ),
          )}
        </div>

        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {FOLLOW_UPS.filter((followUp) => !usedFollowUps.has(followUp.kind)).map((followUp) => (
            <Button
              key={followUp.kind}
              variant="secondary"
              size="sm"
              className="rounded-lg rounded-br-none border border-border shadow-sm"
              disabled={loading}
              onClick={() => handleFollowUp(followUp.kind)}
            >
              {t(followUp.labelKey)}
            </Button>
          ))}
        </div>

        {/* ── Example player modal — same playback experience as the
            subs-search results component's modal (header, mini player,
            controls, subtitles with singleline | multiline toggle). Opened by
            tapping an example chip above. ── */}
        {examplePlayerIndex !== null && exampleVideo && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            onClick={closeExamplePlayer}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div
              className={`relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-xl sm:m-4 sm:rounded-2xl ${
                exampleMode === 'multiline' && isWide ? 'sm:max-w-5xl' : ''
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header — video title + close */}
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h3 className="min-w-0 truncate text-sm font-semibold">{exampleVideo.title}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={closeExamplePlayer}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Player + controls + subtitles — the player lives in a stable
                  tree position (the first grid/flex child), so toggling
                  singleline/multiline or wide/narrow never remounts the
                  YouTube iframe. On wide screens in multiline mode, subtitles
                  sit beside the player and the video info sits below it, like
                  the watch page — but inside the modal. */}
              <div
                className={
                  exampleMode === 'multiline' && isWide
                    ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]'
                    : 'flex min-h-0 flex-1 flex-col'
                }
              >
                {/* Column 1 — player + controls (+ info below on wide multiline) */}
                <div
                  className={
                    exampleMode === 'multiline' && isWide
                      ? 'min-w-0 overflow-y-auto border-r border-border'
                      : 'shrink-0'
                  }
                >
                  {/* Mini player */}
                  <div className="aspect-video w-full bg-black">
                    <YouTubePlayer
                      ref={examplePlayerRef}
                      youtubeId={exampleVideo.youtube_id}
                      autoplay={false}
                      startTime={exampleMatchLine?.starttime}
                      onTimeUpdate={handleExampleTimeUpdate}
                      onDuration={handleExampleDuration}
                      onStateChange={handleExampleStateChange}
                    />
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center border-b border-border px-2 py-1">
                    <VideoControlBar
                      reduced
                      playerRef={examplePlayerRef}
                      currentTime={exampleTime}
                      duration={exampleDuration}
                      paused={examplePaused}
                      onPauseToggle={() => {}}
                      onPreviousLine={goToExamplePreviousLine}
                      onNextLine={goToExampleNextLine}
                      onPreviousVideo={goToExamplePreviousVideo}
                      onNextVideo={goToExampleNextVideo}
                      onTogglePanel={toggleExampleMode}
                      panelOpen={exampleMode === 'multiline'}
                      hasPreviousLine={exampleHasPrevLine}
                      hasNextLine={exampleHasNextLine}
                      hasPreviousVideo={examplePlayerIndex > 0}
                      hasNextVideo={examplePlayerIndex < exampleVideos.length - 1}
                      videoCountText={t('msg.video_n_of_total', {
                        n: examplePlayerIndex + 1,
                        total: exampleVideos.length,
                      })}
                    />
                  </div>

                  {/* Video info below the player on wide multiline (watch page) */}
                  {exampleMode === 'multiline' && isWide && exampleVideoInfoContent}
                </div>

                {/* Column 2 — subtitles: singleline line-follower, or multiline
                    tabbed sidebar (subs | info). On wide multiline the info tab
                    is dropped (info lives below the player) and the sidebar is
                    the subs transcript. */}
                <div
                  className={
                    exampleMode === 'multiline' && isWide
                      ? 'min-h-0 min-w-0'
                      : 'min-h-0 flex-1'
                  }
                >
                  {exampleMode === 'singleline' ? (
                    <div className="h-full min-h-0 overflow-y-auto py-2">
                      <SubtitleDisplay
                        mode="singleline"
                        youtubeId={exampleVideo.youtube_id}
                        currentTime={exampleTime}
                        videoTitle={exampleVideo.title}
                        initialLines={exampleInitialLines}
                        highlightTerms={[word]}
                        defaultLine={exampleDefaultLine}
                        onSeekToLine={(t) => examplePlayerRef.current?.seekTo(t)}
                      />
                    </div>
                  ) : (
                    <VideoSidebarPanel
                      tabs={
                        exampleMode === 'multiline' && isWide
                          ? [
                              { key: 'subs', label: t('label.subtitles'), icon: <FileText className="h-4 w-4" /> },
                            ]
                          : [
                              { key: 'subs', label: t('label.subtitles'), icon: <FileText className="h-4 w-4" /> },
                              { key: 'info', label: t('title.info'), icon: <Info className="h-4 w-4" /> },
                            ]
                      }
                      activeTab={examplePanelTab}
                      onTabChange={setExamplePanelTab}
                      contentRef={exampleSidebarRef}
                      className="h-full min-h-0"
                    >
                      {(tab) => {
                        if (tab === 'subs') {
                          return (
                            <SubtitleDisplay
                              mode="multiline"
                              youtubeId={exampleVideo.youtube_id}
                              currentTime={exampleTime}
                              videoTitle={exampleVideo.title}
                              initialLines={exampleInitialLines}
                              highlightTerms={[word]}
                              defaultLine={exampleDefaultLine}
                              scrollContainerRef={exampleSidebarRef}
                              onSeekToLine={(t) => examplePlayerRef.current?.seekTo(t)}
                            />
                          );
                        }
                        return exampleVideoInfoContent;
                      }}
                    </VideoSidebarPanel>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}
