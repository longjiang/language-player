import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import * as Clipboard from 'expo-clipboard';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { MarkdownExplanation } from '@/components/dictionary/MarkdownExplanation';
import { ErrorNotice } from '@/components/ui/error-notice';
import { localizedError } from '@/lib/errors';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';
import { baseCode, parseSubsL2, findMatchLine, durationToSeconds, AI_EXAMPLES_LIMIT, buildAiExamplesPayload, buildAiExamplesPrompt, parseAiExamplesResponse } from '@langplayer/utils';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { SubsSearchRow, type SubsSearchRowSegment } from '@/components/video/SubsSearchRow';
import { SubsSearchPlaybackModal } from '@/components/video/SubsSearchPlaybackModal';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { Sparkles, RefreshCw, Copy, Check } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

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
  /** The usage pattern the LLM identified for the examples above (L1 heading
   *  + L2 syntax pattern), rendered as a sort-by-AI-style group header. */
  pattern?: { heading: string; pattern: string };
  /** True while the "Examples from Videos" follow-up is fetching/analyzing
   *  (non-streaming request — shows a spinner in the assistant bubble). */
  loading?: boolean;
}

// ── Subs-search helpers (mirror SubsSearchResults.tsx) ──

function lineHasAnyTerm(line: string, terms: string[]): boolean {
  const lower = line.toLowerCase();
  return terms.some((f) => lower.includes(f.trim().toLowerCase()));
}

/** The first search form that appears in this line (translation highlight). */
function firstMatchingForm(line: string, terms: string[]): string | undefined {
  const lower = line.toLowerCase();
  return terms
    .map((f) => f.trim())
    .filter(Boolean)
    .find((f) => lower.includes(f.toLowerCase()));
}

interface AiExplanationProps {
  /** The word being looked up (surface form). */
  word: string;
  /** The inflected form as it appears in context (may differ from word). */
  contextForm?: string;
  /** The surrounding context sentence. */
  contextText?: string;
  /** Whether a dictionary entry was found (affects prompt wording). */
  entryFound: boolean;
  /** When true, streams immediately without showing a button. */
  autoLoad?: boolean;
  /** Full searchable form list (head + script variants + inflections) — the
   *  same term set the dictionary tabs' subs search uses. When provided, the
   *  "Examples from Videos" follow-up searches all of them so a kana/kanji
   *  (or written-form) mismatch can't zero out the results. Falls back to
   *  head + inflected surface form when omitted (dictionary popup). */
  searchTerms?: string[];
}

/**
 * "Let DeepSeek Explain" — Pro-only feature for the dictionary popup.
 * Matches web: streaming chat with regenerate, copy, and follow-up question
 * buttons (inflection / morphemes / etymology / syntax / synonyms).
 */
export function AiExplanation({ word, contextForm, contextText, entryFound, autoLoad = false, searchTerms }: AiExplanationProps) {
  const { isPro, loaded: subLoaded } = useSubscription();
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { display } = useSettingsContext();
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation();
  const [showAi, setShowAi] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<Set<FollowUpKind>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messageIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── "Examples from Videos" player modal state ──
  // The shared SubsSearchPlaybackModal (the same modal the subs-search results
  // rows open) renders the player; this component only tracks which example
  // chip is open. Opened by tapping an example chip in the AI chat.
  const [examplePlayerIndex, setExamplePlayerIndex] = useState<number | null>(null);

  // Open the shared playback modal on the tapped example chip's video.
  const openExamplePlayer = useCallback((index: number) => {
    setExamplePlayerIndex(index);
  }, []);

  const l1NameRef = useRef(l1Lang.name);
  const l2NameRef = useRef(l2Lang.name);
  const l2CodeRef = useRef(l2Lang.code);
  l1NameRef.current = l1Lang.name;
  l2NameRef.current = l2Lang.name;
  l2CodeRef.current = l2Lang.code;

  const appendMessage = useCallback((message: Omit<ChatMessage, 'id'>) => {
    const id = messageIdRef.current++;
    setMessages((prev) => [...prev, { ...message, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const buildPrompt = useCallback((): string => {
    const l1Name = l1NameRef.current;
    const l2Name = l2NameRef.current;
    const code = l2CodeRef.current;

    let prompt: string;
    if (contextText && contextForm && contextForm !== word) {
      prompt = t('prompt.explain_word_context_form', { l1Name, l2Name, code, word, contextForm, context: contextText });
    } else if (contextText) {
      prompt = t('prompt.explain_word_context', { l1Name, l2Name, code, word, context: contextText });
    } else {
      prompt = t('prompt.explain_word', { l1Name, l2Name, code, word });
    }

    const nonInflecting = ['zh', 'vi', 'th', 'lo', 'km'];
    if (!nonInflecting.includes(code)) {
      prompt += ' ' + t('prompt.explain_morphology');
    }

    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [t, word, contextText, contextForm]);

  const buildFollowUpPrompt = useCallback((kind: FollowUpKind): string => {
    const l1Name = l1NameRef.current;
    const l2Name = l2NameRef.current;
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;
    const wordParams = { l1Name, l2Name, word };

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

    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [t, word, contextText, contextForm]);

  const startStream = useCallback((prompt: string, regenerate = false) => {
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    void stream(prompt, regenerate ? { regenerate: true } : undefined);
  }, [appendMessage, stream]);

  const fetchExplanation = useCallback(() => {
    startStream(buildPrompt());
  }, [startStream, buildPrompt]);

  const handleRegenerate = useCallback((messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    updateMessage(messageId, { text: '', prompt: target.prompt ?? buildPrompt() });
    setStreamingId(messageId);
    void stream(target.prompt ?? buildPrompt(), { regenerate: true });
  }, [messages, updateMessage, buildPrompt, stream]);

  // ── "Examples from Videos" follow-up (web parity) ──
  // 1. Search subtitles (limit 50) for the word being explained.
  // 2. Feed a succinct payload (≤3 subtitle lines per video) to the LLM,
  //    along with the context sentence when available.
  // 3. Like the subs-search "Sort by AI" grouping, the LLM identifies the
  //    single usage pattern of the term — the one matching its use in the
  //    context sentence (or the most representative usage without context) —
  //    and replies with strict JSON: { heading, pattern, examples: [...] }.
  // 4. The client maps ids back to the fetched results and renders a
  //    sort-by-AI-style pattern header (L1 heading + L2 syntax pattern) above
  //    the example chips (the same SubsSearchRow component the results list
  //    uses, translations included), each chip followed by the LLM's
  //    explanation of the word's usage in that result.
  const fetchSubsSearch = useCallback(
    async (term: string): Promise<SubsSearchVideo[]> => {
      const res = await fetch(
        `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(term)}&l2=${baseCode(l2Lang.code)}&limit=${AI_EXAMPLES_LIMIT}&context=3`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
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
    [l2Lang.code],
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
      // Search every known form of the word (head + script variants +
      // inflections) — the same term set the dictionary tabs' subs search
      // uses — so a kana/kanji (or written-form) mismatch can't zero out the
      // results. Falls back to head + inflected surface form when no form
      // list is supplied (dictionary popup). All results (up to
      // AI_EXAMPLES_LIMIT) are passed to the LLM below.
      const terms =
        searchTerms && searchTerms.length > 0
          ? searchTerms.join(',')
          : (contextForm && contextForm !== word ? `${word},${contextForm}` : word);
      const results = await fetchSubsSearch(terms);
      if (results.length === 0) throw new Error('no subs-search results');

      const l1Name = l1NameRef.current;
      const l2Name = l2NameRef.current;
      const lines = buildAiExamplesPayload(results);
      const prose = t('prompt.subs_ai_examples', {
        n: results.length,
        l2Name,
        term: terms,
      });
      // The context sentence (when available) anchors the LLM's choice of
      // usage pattern to the sense the user is actually looking at.
      const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;
      const prompt = buildAiExamplesPrompt({
        prose,
        lines,
        l1Name,
        l2Name,
        term: terms,
        context: cleanContext,
      });
      log('AI examples follow-up request', {
        word,
        terms,
        context: cleanContext ?? undefined,
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
        pattern: { heading: parsed.heading, pattern: parsed.pattern },
        examples,
        loading: false,
      });
      log('AI examples follow-up applied', {
        word,
        pattern: parsed.heading,
        n: examples.length,
      });
    } catch (err) {
      logwarn('AI examples follow-up failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      updateMessage(aiId, { text: t('msg.ai_examples_failed'), loading: false });
    }
  }, [word, contextForm, contextText, searchTerms, t, appendMessage, updateMessage, fetchSubsSearch]);

  const handleFollowUp = useCallback((kind: FollowUpKind) => {
    if (kind === 'examples') {
      void handleExamplesFollowUp();
      return;
    }
    const followUp = FOLLOW_UPS.find((f) => f.kind === kind);
    setUsedFollowUps((prev) => {
      const next = new Set(prev);
      next.add(kind);
      return next;
    });
    appendMessage({ role: 'user', text: '', label: followUp ? t(followUp.labelKey) : '' });
    startStream(buildFollowUpPrompt(kind));
  }, [appendMessage, startStream, buildFollowUpPrompt, t, handleExamplesFollowUp]);

  // ── Example chips: lazy translations (same pipeline as the results list) ──
  const examplesMessage = useMemo(
    () => messages.find((m) => m.examples && m.examples.length > 0),
    [messages],
  );
  // Memoized exactly like web (ai-explanation.tsx): a raw `?? []` would hand
  // useSubtitleTranslation a NEW l2Lines identity on every render, re-firing
  // its `[l2Lines]` reset effect (setState) after every render — an infinite
  // update loop that crashed the dictionary popup with "Maximum update depth
  // exceeded" on any re-render (saving a word, Let DeepSeek Explain, etc.).
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
    const forms: (string | null | undefined)[] = [];
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
  } = useSubtitleTranslation(
    exampleTranslationInput.lines,
    l1Lang.code,
    baseCode(l2Lang.code),
    display.translation && exampleTranslationInput.lines.length > 0,
    0,
    exampleTranslationInput.forms,
  );


  const handleCopy = useCallback(async (messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target?.text) return;
    await Clipboard.setStringAsync(target.text);
    setCopiedId(messageId);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
  }, [messages]);

  // Mirror the streaming hook's text into the assistant message being streamed.
  useEffect(() => {
    if (streamingId === null) return;
    updateMessage(streamingId, { text: explanation });
  }, [explanation, streamingId, updateMessage]);

  // Clear streamingId when the stream finishes.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setStreamingId(null);
    }
  }, [loading]);

  // Fetch when `showAi` is toggled, or when autoLoad + Pro resolve.
  useEffect(() => {
    if ((showAi || autoLoad) && isPro && subLoaded && messages.length === 0 && !loading) {
      fetchExplanation();
    }
  }, [showAi, autoLoad, isPro, subLoaded, messages.length, loading, fetchExplanation]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    reset();
  }, [reset]);

  // Pro gate — still loading subscription
  if (!subLoaded) return null;

  // Pro gate — free user
  if (!isPro) {
    return (
      <View className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
        <Text className="text-center text-sm text-amber-700 dark:text-amber-300">
          <Sparkles size={14} color="#d97706" /> {t('msg.ai_pro_feature')}
        </Text>
      </View>
    );
  }

  // Not yet toggled — show the button (skip when autoLoad)
  if (!showAi && !autoLoad) {
    return (
      <View className="mt-4 pb-2">
        <Pressable
          onPress={() => setShowAi(true)}
          className="flex-row items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 active:bg-muted"
        >
          <Sparkles size={16} color={ICON_PRIMARY} />
          <Text className="text-sm font-medium text-foreground">{t('action.let_ai_explain')}</Text>
        </Pressable>
      </View>
    );
  }

  // Loading before the first assistant placeholder exists
  if (loading && !explanation && messages.length === 0) {
    return (
      <View className="mt-4">
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={ICON_MUTED} />
          <Text className="text-sm text-muted-foreground">{t('msg.getting_ai_response')}</Text>
        </View>
      </View>
    );
  }

  // Streaming or complete — show the chat transcript
  if (messages.length > 0 || loading || error) {
    return (
      <View className="mt-4 mb-2">
        <View className="mb-2 flex-row items-center gap-2">
          <Sparkles size={12} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground">{t('label.ai_says')}</Text>
          {loading && <ActivityIndicator size="small" color={ICON_MUTED} />}
        </View>

        {/* Chat transcript — explicit per-message margins (mb-3) so the gap
            between a user follow-up bubble and the AI response that follows
            is always visible, independent of container space-y support. */}
        <View>
          {messages.map((message) =>
            message.role === 'user' ? (
              <View key={message.id} className="mb-3 items-end">
                <View className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2">
                  <Text className="text-sm text-primary-foreground">{message.label}</Text>
                </View>
              </View>
            ) : (
              <View key={message.id} className="mb-3 items-start">
                <View className="max-w-[95%] rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2">
                  {message.loading ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator size="small" color={ICON_MUTED} />
                      <Text className="text-xs text-muted-foreground">{t('msg.getting_ai_response')}</Text>
                    </View>
                  ) : loading && message.id === streamingId && !message.text ? (
                    <ActivityIndicator size="small" color={ICON_MUTED} />
                  ) : (
                    <MarkdownExplanation
                      text={message.text}
                      l2Code={l2Lang.code}
                      streaming={loading && message.id === streamingId}
                    />
                  )}
                  {(message.examples?.length ?? 0) > 0 && (
                    <View className="mt-2">
                      {message.pattern && (
                        <View className="mb-2 rounded-lg border border-border bg-muted/60 px-2 py-1">
                          <Text className="text-[11px] font-semibold text-foreground">
                            {message.pattern.heading}
                          </Text>
                          {message.pattern.pattern ? (
                            <Text className="text-[10px] text-muted-foreground">
                              {message.pattern.pattern}
                            </Text>
                          ) : null}
                        </View>
                      )}
                      {message.examples!.map((ex, i) => (
                        <View key={ex.video.id}>
                          <SubsSearchRow
                            video={ex.video}
                            isActive={false}
                            onSelect={() => openExamplePlayer(i)}
                            segments={exampleSegments[i] ?? []}
                            highlightTerms={[word]}
                            showTranslation={display.translation}
                            translationStart={exampleTranslationInput.rowStarts[i] ?? 0}
                            translations={exampleTranslations}
                          />
                          <Text className="mb-2 text-xs leading-relaxed text-muted-foreground">
                            {ex.explanation}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View className="mt-1 flex-row items-center gap-1 pl-1">
                  {(message.examples?.length ?? 0) === 0 && (
                    <Pressable
                      onPress={() => handleRegenerate(message.id)}
                      disabled={loading}
                      className="rounded p-1 active:bg-muted disabled:opacity-40"
                      accessibilityLabel={t('action.regenerate')}
                    >
                      <RefreshCw size={12} color={ICON_MUTED} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleCopy(message.id)}
                    disabled={loading || message.loading || !message.text}
                    className="rounded p-1 active:bg-muted disabled:opacity-40"
                    accessibilityLabel={t('action.copy')}
                  >
                    {copiedId === message.id ? (
                      <Check size={12} color={ICON_PRIMARY} />
                    ) : (
                      <Copy size={12} color={ICON_MUTED} />
                    )}
                  </Pressable>
                </View>
              </View>
            ),
          )}
        </View>

        {error && (
          <ErrorNotice message={localizedError(t, error)} className="mt-2" />
        )}

        {FOLLOW_UPS.filter((followUp) => !usedFollowUps.has(followUp.kind)).length > 0 && (
          <View className="mt-3 flex-row flex-wrap justify-end gap-2">
            {FOLLOW_UPS.filter((followUp) => !usedFollowUps.has(followUp.kind)).map((followUp) => (
              <Pressable
                key={followUp.kind}
                onPress={() => handleFollowUp(followUp.kind)}
                disabled={loading}
                className="rounded-lg rounded-br-none border border-border px-3 py-1.5 active:bg-muted disabled:opacity-40"
              >
                <Text className="text-xs font-medium text-foreground">{t(followUp.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Example player modal — the same shared modal the subs-search
            results rows open (mini player + controls + subtitles with
            singleline | multiline). Rendered through the native Dialog
            portal, so it sizes against the screen even when opened from the
            dictionary popup. Opened by tapping an example chip. ── */}
        <SubsSearchPlaybackModal
          videos={exampleVideos.map((ex) => ex.video)}
          index={examplePlayerIndex}
          onIndexChange={setExamplePlayerIndex}
          highlightTerms={[word]}
        />
      </View>
    );
  }

  return null;
}
