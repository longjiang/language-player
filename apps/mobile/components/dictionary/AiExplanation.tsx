import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useStreamingExplanation, type StreamHistoryTurn } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { MarkdownExplanation } from '@/components/dictionary/MarkdownExplanation';
import { ErrorNotice } from '@/components/ui/error-notice';
import { localizedError } from '@/lib/errors';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';
import { baseCode, parseSubsL2, findMatchLine, durationToSeconds, AI_EXAMPLES_LIMIT, buildAiExamplesPayload, buildAiExamplesPrompt, parseAiExamplesResponse, buildWordExplainPrompt, presetKey, splitAiQuotes, normalizeQuoteBlocks, READER_AI_QUOTE_INSTRUCTION, READER_AI_SUMMARY_INSTRUCTION, READER_AI_CONTEXT_WARN_MAX, type AiFollowUpPreset, type ReaderAiContent } from '@langplayer/utils';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { SubsSearchRow, type SubsSearchRowSegment } from '@/components/video/SubsSearchRow';
import { SubsSearchPlaybackModal } from '@/components/video/SubsSearchPlaybackModal';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { Sparkles, RefreshCw, Copy, Check, Send, Quote, ChevronRight } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

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
  /** Optional one-tap preset follow-up buttons (prompt templates or the
   *  "Examples from Videos" flow). Defaults to `[]` (no preset buttons — the
   *  card shows only the free-form chat input); pass `DEFAULT_AI_FOLLOW_UPS`
   *  for the dictionary preset set. */
  followUpPresets?: AiFollowUpPreset[];
  /** Reader "Ask AI": content blocks injected into presets that carry a
   *  `contentKey` (e.g. the shared `prompt.summarize`). Ignored by the word /
   *  dictionary path. */
  readerContent?: ReaderAiContent;
  /** Reader "Ask AI": when set (with autoLoad), stream this preset's prompt
   *  instead of the word-explain prompt (e.g. summarize the current page). */
  initialPreset?: AiFollowUpPreset & { kind: 'prompt' };
  /** Reader "Ask AI": render quote chips from `[[original||translation]]`
   *  markers in each assistant reply (requires `onQuotePress`). */
  quoteChips?: boolean;
  /** Reader "Ask AI": fired when a quote chip is tapped (opens reader search). */
  onQuotePress?: (original: string) => void;
  /** Reader "Ask AI": open the chat but do NOT auto-stream. The user must tap a
   *  preset button or send a message to get a response (readers only). */
  demandMode?: boolean;
  /** Persist the chat transcript under this storage key, restoring it on mount
   *  (e.g. per note, per web page, per book, per video). When omitted the
   *  transcript is ephemeral (current behavior). */
  storageKey?: string;
  /** Video "Ask AI": when set, `[MM:SS]` timestamps in each assistant reply
   *  render as tappable chips that call back with the time in seconds (the
   *  caller seeks the video). Also appends a timestamp-citation instruction to
   *  prompts so the model cites the subtitle timestamps it refers to. */
  onTimestampPress?: (timeSeconds: number) => void;
}

/**
 * "Let DeepSeek Explain" — Pro-only feature for the dictionary popup.
 * Matches web: multi-turn streaming chat with regenerate, copy, a free-form
 * follow-up input, and optional configurable one-tap preset buttons.
 */
/**
 * Persisted Ask-AI chat transcript shape (subset of `ChatMessage` sufficient to
 * rebuild a session — `examples` and transient fields are dropped).
 */
interface PersistedAiMessage {
  role: 'user' | 'assistant';
  text: string;
  label?: string;
  prompt?: string;
}

async function loadPersistedMessages(storageKey: string): Promise<PersistedAiMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is PersistedAiMessage =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
    );
  } catch {
    return [];
  }
}

async function savePersistedMessages(storageKey: string, messages: PersistedAiMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(messages));
  } catch {
    /* persistence is best-effort */
  }
}

async function clearPersistedMessages(storageKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

export function AiExplanation({ word, contextForm, contextText, entryFound, autoLoad = false, searchTerms, followUpPresets = [], readerContent, initialPreset, quoteChips = false, onQuotePress, demandMode = false, storageKey, onTimestampPress }: AiExplanationProps) {
  const { isPro, loaded: subLoaded } = useSubscription();
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { display } = useSettingsContext();
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation();
  const [showAi, setShowAi] = useState(demandMode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<Set<string>>(new Set());
  const [freeFormText, setFreeFormText] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messageIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Persisted session (storageKey) ─────────────────────────────────────────
  // When a storageKey is supplied (per note / web page / book / video), the
  // transcript is persisted so the chat survives navigation. Restored on
  // mount / storage-key change; saved on every message change.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    (async () => {
      const saved = await loadPersistedMessages(storageKey);
      if (cancelled) return;
      const restored: ChatMessage[] = saved.map((m, i) => ({
        id: i,
        role: m.role,
        text: m.text,
        label: m.label,
        prompt: m.prompt,
      }));
      messageIdRef.current = restored.length;
      setMessages(restored);
      setStreamingId(null);
      setUsedFollowUps(new Set());
      reset();
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, reset]);

  useEffect(() => {
    if (!storageKey) return;
    const persisted = messages
      .filter((m) => (m.role === 'user' ? !!(m.text || m.label) : !!m.text))
      .map((m) => ({ role: m.role, text: m.text, label: m.label, prompt: m.prompt }));
    void savePersistedMessages(storageKey, persisted);
  }, [messages, storageKey]);

  /** Clear the persisted transcript (and drop the stored copy). */
  const handleClear = useCallback(() => {
    setMessages([]);
    setStreamingId(null);
    setUsedFollowUps(new Set());
    setFreeFormText('');
    if (storageKey) void clearPersistedMessages(storageKey);
    reset();
  }, [storageKey, reset]);

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
    const l2Name = l2NameRef.current;
    const code = l2CodeRef.current;

    // Shared assembly (SPEC-035) — identical to web: strips trailing context
    // punctuation, picks the context-form/context/plain template, appends the
    // morphology instruction for non-inflecting L2s, and appends the backtick
    // instruction.
    return buildWordExplainPrompt({
      templates: {
        contextForm: t('prompt.explain_word_context_form'),
        context: t('prompt.explain_word_context'),
        plain: t('prompt.explain_word'),
        morphology: t('prompt.explain_morphology'),
        ticks: t('prompt.explain_ticks'),
      },
      l2Name,
      word,
      contextForm,
      context: contextText,
      l2Code: code,
    });
  }, [t, word, contextText, contextForm]);

  const buildPresetPrompt = useCallback((preset: AiFollowUpPreset & { kind: 'prompt' }): string => {
    const l1Name = l1NameRef.current;
    const l2Name = l2NameRef.current;
    // Strip trailing punctuation from context to avoid doubled periods.
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;
    // Reader "Ask AI": inject the preset's named content block into the prompt.
    const contentKey = preset.contentKey;
    const text = contentKey ? (readerContent?.[contentKey] ?? '') : '';
    // Resolve the preset's prompt template with every known param. Empty-string
    // fallbacks keep next-intl from throwing on an unbound placeholder when a
    // template references {context}/{contextForm} but none is on hand.
    const body = t(preset.promptKey, {
      l1Name,
      l2Name,
      word,
      context: cleanContext ?? '',
      contextForm: contextForm ?? '',
      ...(contentKey ? { text } : {}),
    });
    // Content-based presets (reader summaries / text analyses) are prose in
    // the target language, not interactive L2 spans — skip the backtick
    // formatting instruction. Summary-shaped presets append the summary
    // instruction; the quote-chip instruction is appended only when the chat
    // renders quote chips (reader surfaces). A non-quoting content preset
    // (tokenized-text analyses) appends the backtick instruction instead so
    // L2 terms still render tokenized.
    if (contentKey) {
      const parts = [body];
      if (preset.summaryInstruction !== false) parts.push(READER_AI_SUMMARY_INSTRUCTION);
      if (quoteChips) parts.push(READER_AI_QUOTE_INSTRUCTION);
      else {
        const ticksPrompt = t('prompt.explain_ticks', { l2Name });
        if (ticksPrompt) parts.push(ticksPrompt);
      }
      return parts.join('\n\n');
    }
    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return [body, ticksPrompt].filter(Boolean).join('\n\n');
  }, [t, word, contextText, contextForm, readerContent, quoteChips]);

  // Reconstruct the prior conversation as {role, content} turns for the
  // multi-turn endpoint. Every streamed assistant message stores the exact
  // prompt that produced it (.prompt), so its user turn is reconstructed from
  // that prompt. "Examples from Videos" turns (no streaming prompt) and any
  // still-empty in-flight placeholder are skipped.
  const buildHistory = useCallback((): StreamHistoryTurn[] => {
    const turns: StreamHistoryTurn[] = [];
    for (const m of messages) {
      if (m.role !== 'assistant' || m.examples || !m.text) continue;
      if (m.prompt) turns.push({ role: 'user', content: m.prompt });
      turns.push({ role: 'assistant', content: m.text });
    }
    return turns;
  }, [messages]);

  const startStream = useCallback((prompt: string, options?: { regenerate?: boolean; messages?: StreamHistoryTurn[] }) => {
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    void stream(prompt, options);
  }, [appendMessage, stream]);

  const fetchExplanation = useCallback(() => {
    startStream(initialPreset ? buildPresetPrompt(initialPreset) : buildPrompt());
  }, [startStream, buildPrompt, buildPresetPrompt, initialPreset]);

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

  const handleFollowUp = useCallback((preset: AiFollowUpPreset) => {
    // Mark used once-per-transcript for every preset kind (incl. examples).
    setUsedFollowUps((prev) => {
      const next = new Set(prev);
      next.add(presetKey(preset));
      return next;
    });
    if (preset.kind === 'examples') {
      void handleExamplesFollowUp();
      return;
    }
    const prompt = buildPresetPrompt(preset);
    // Reuse the buildHistory computed before this follow-up's bubbles are
    // appended — it reconstructs the prior conversation (assistant replies
    // with their prompts), not the turn we're about to start.
    const history = buildHistory();
    appendMessage({
      role: 'user',
      text: '',
      label: t(preset.labelKey),
    });
    startStream(prompt, { messages: history });
  }, [appendMessage, startStream, buildPresetPrompt, t, handleExamplesFollowUp, buildHistory]);

  const handleSendFreeForm = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setFreeFormText('');
    const history = buildHistory();
    // Reader "Ask AI": preload the full text/book as follow-up context so the
    // model grounds the answer in the whole surface, not just the prior turns.
    const contextText = readerContent?.text ?? '';
    const quoteInstr = quoteChips ? `\n\n${READER_AI_QUOTE_INSTRUCTION}` : '';
    const prompt = contextText
      ? `Here is the complete text to use as context when answering:\n\n${contextText}\n\nQuestion: ${text}${quoteInstr}`
      : quoteChips ? `${text}\n\n${READER_AI_QUOTE_INSTRUCTION}` : text;
    // Send the typed message as the new user turn; the prior conversation
    // (reconstructed above) grounds it in the word/context already discussed.
    appendMessage({ role: 'user', text, label: text, prompt });
    startStream(prompt, { messages: history });
  }, [startStream, appendMessage, buildHistory, quoteChips, readerContent]);

  // Reader Ask-AI: chat messages interleave [[original||translation]] quote
  // markers with prose. `renderInlineQuotes` splits the raw text on those
  // markers and renders each as a full-width BLOCK chip (own row: quote icon
  // on the left, right-chevron on the right) at its position, rather than
  // stripping them out and piling every chip at the bottom. Every marker
  // renders as a chip (the model is asked to quote exactly; a chip whose
  // passage isn't verbatim simply opens a search that finds nothing rather
  // than dropping the quote and leaving a gap). The text is normalized first
  // (normalizeQuoteBlocks) so a marker the model slipped into the middle of a
  // sentence is hoisted onto its own line — the chip never breaks a sentence
  // inline, and the surrounding prose stays readable.
  const renderInlineQuotes = useCallback(
    (raw: string) => {
      const segments = splitAiQuotes(normalizeQuoteBlocks(raw));
      return (
        <View className="gap-1.5">
          {segments.map((seg, i) =>
            seg.type === 'text' ? (
              seg.value.trim().length > 0 ? (
                <Text key={i} className="text-sm leading-relaxed text-foreground">
                  {seg.value.trim()}
                </Text>
              ) : null
            ) : (
              <Pressable
                key={i}
                onPress={() => onQuotePress?.(seg.original)}
                accessibilityLabel={t('action.search')}
                className="flex-row items-center gap-2 rounded-md border border-border bg-muted/60 px-2.5 py-2 active:bg-muted"
              >
                <Quote size={13} color={ICON_MUTED} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-xs font-medium text-foreground">
                    {seg.original}
                  </Text>
                  {seg.translation ? (
                    <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
                      {seg.translation}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={13} color={ICON_MUTED} />
              </Pressable>
            ),
          )}
        </View>
      );
    },
    [onQuotePress, t],
  );

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
    if (demandMode) return; // reader Ask-AI: no auto response — user must act
    if ((showAi || autoLoad) && isPro && subLoaded && messages.length === 0 && !loading) {
      fetchExplanation();
    }
  }, [demandMode, showAi, autoLoad, isPro, subLoaded, messages.length, loading, fetchExplanation]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    reset();
  }, [reset]);

  // Pro gate — still loading subscription
  if (!subLoaded) return null;

  // Pro gate — free user
  if (!isPro) {
    return (
      /* mb-2 matches the gap below the "Let DeepSeek explain" button
         (its wrapper's pb-2) — the banner must not touch the button below. */
      <View className="mt-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
        <Text className="text-center text-sm text-amber-700 dark:text-amber-300">
          <Sparkles size={14} color="#d97706" /> {t('msg.ai_pro_feature')}
        </Text>
      </View>
    );
  }

  // Not yet toggled — show the button (skip when autoLoad or demandMode)
  if (!showAi && !autoLoad && !demandMode) {
    return (
      <View className="mt-4 pb-2">
        <Button
          onPress={() => setShowAi(true)}
          variant="outline"
        >
          <Sparkles size={16} color={ICON_PRIMARY} />
          <Text className={buttonTextClass('outline')}>{t('action.let_ai_explain')}</Text>
        </Button>
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
  if (demandMode || messages.length > 0 || loading || error) {
    return (
      <View className="mt-4 mb-2">
        {readerContent && (readerContent.text?.length ?? 0) > READER_AI_CONTEXT_WARN_MAX ? (
          <View className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
            <Text className="text-xs text-amber-700 dark:text-amber-300">
              {t('msg.reader_context_too_large')}
            </Text>
          </View>
        ) : null}
        <View className="mb-2 flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <Sparkles size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('label.ai_says')}</Text>
            {loading && <ActivityIndicator size="small" color={ICON_MUTED} />}
          </View>
          {storageKey && messages.length > 0 ? (
            <Pressable onPress={handleClear} className="rounded-md px-1.5 py-0.5 active:bg-muted" accessibilityRole="button">
              <Text className="text-[11px] text-muted-foreground">{t('action.clear_conversation')}</Text>
            </Pressable>
          ) : null}
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
                  ) : quoteChips && onQuotePress && message.text ? (
                    renderInlineQuotes(message.text)
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
                    <Button
                      onPress={() => handleRegenerate(message.id)}
                      disabled={loading}
                      variant="ghost"
                      size="icon"
                      accessibilityLabel={t('action.regenerate')}
                    >
                      <RefreshCw size={12} color={ICON_MUTED} />
                    </Button>
                  )}
                  <Button
                    onPress={() => handleCopy(message.id)}
                    disabled={loading || message.loading || !message.text}
                    variant="ghost"
                    size="icon"
                    accessibilityLabel={t('action.copy')}
                  >
                    {copiedId === message.id ? (
                      <Check size={12} color={ICON_PRIMARY} />
                    ) : (
                      <Copy size={12} color={ICON_MUTED} />
                    )}
                  </Button>
                </View>
              </View>
            ),
          )}
        </View>

        {error && (
          <ErrorNotice message={localizedError(t, error)} className="mt-2" />
        )}

        {followUpPresets.filter((p) => !usedFollowUps.has(presetKey(p))).length > 0 && (
          <View className="mt-3 flex-row flex-wrap justify-end gap-2">
            {followUpPresets
              .filter((p) => !usedFollowUps.has(presetKey(p)))
              .map((p) => (
                <Pressable
                  key={presetKey(p)}
                  onPress={() => handleFollowUp(p)}
                  disabled={loading}
                  className="rounded-lg rounded-br-none border border-border px-3 py-1.5 active:bg-muted disabled:opacity-40"
                >
                  <Text className="text-sm font-medium text-foreground">{t(p.labelKey)}</Text>
                </Pressable>
              ))}
          </View>
        )}

        {/* Free-form follow-up input — lets the user ask anything about the
            word/phrase in the ongoing multi-turn chat. Disabled while a reply
            is streaming so turns stay ordered. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          <View className="mt-3 flex-row items-center gap-2">
            <TextInput
              value={freeFormText}
              onChangeText={setFreeFormText}
              placeholder={t('placeholder.ask_follow_up')}
              editable={!loading}
              placeholderTextColor={ICON_MUTED}
              onSubmitEditing={() => handleSendFreeForm(freeFormText)}
              returnKeyType="send"
              className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            />
            <Button
              onPress={() => handleSendFreeForm(freeFormText)}
              disabled={loading || !freeFormText.trim()}
              variant="outline"
              size="sm"
              accessibilityLabel={t('action.send')}
            >
              <Send size={14} color={ICON_PRIMARY} />
              <Text className={buttonTextClass('outline')}>{t('action.send')}</Text>
            </Button>
          </View>
        </KeyboardAvoidingView>

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
