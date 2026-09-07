'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { languageName, baseCode } from '@/lib/language-data';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useStreamingExplanation, type StreamDiagnostics, type StreamHistoryTurn } from '@langplayer/api-client';
import {
  buildWordExplainPrompt,
  presetKey,
  READER_AI_QUOTE_INSTRUCTION,
  READER_AI_SUMMARY_INSTRUCTION,
  VIDEO_AI_TIMESTAMP_INSTRUCTION,
  VIDEO_AI_CONCISE_ITEMS_INSTRUCTION,
  READER_AI_CONTEXT_WARN_MAX,
  type AiFollowUpPreset,
  type ReaderAiContent,
} from '@langplayer/utils';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { useT } from '@/hooks/use-t';
import { log, logwarn, askAiLogger } from '@/lib/logger';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import { MarkdownExplanation } from '@/components/markdown-explanation';
import { SubsSearchRow, type SubsSearchRowSegment } from '@/components/video/subs-search-row';
import { SubsSearchPlaybackModal } from '@/components/video/subs-search-playback-modal';
import {
  parseSubsL2,
  findMatchLine,
  parseNotes,
  durationToSeconds,
  AI_EXAMPLES_LIMIT,
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
  Send,
  Trash2,
} from 'lucide-react';

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
  /** Reader / video "Ask AI": open the chat but do NOT auto-stream. The user
   *  must tap a preset button or send a message to get a response (readers and
   *  the video watch-page tab: no pre-loaded default reply). */
  demandMode?: boolean;
  /** Persist the chat transcript under this localStorage key, restoring it on
   *  mount (e.g. per note, per web page, per book, per video). When omitted the
   *  transcript is ephemeral (current behavior). */
  storageKey?: string;
  /** Video "Ask AI": when set, `[MM:SS]` timestamps in each assistant reply
   *  render as tappable chips that call back with the time in seconds (the
   *  caller seeks the video). Also appends a timestamp-citation instruction to
   *  prompts so the model cites the subtitle timestamps it refers to. */
  onTimestampPress?: (timeSeconds: number) => void;
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

/**
 * Persisted Ask-AI chat transcript shape (subset of `ChatMessage` sufficient
 * to rebuild a session — `examples` and transient fields are dropped).
 */
interface PersistedAiMessage {
  role: 'user' | 'assistant';
  text: string;
  label?: string;
  prompt?: string;
}

function loadPersistedMessages(storageKey: string): PersistedAiMessage[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      askAiLogger.log('session restore: localStorage read — no stored value (empty)', { storageKey });
      return [];
    }
    askAiLogger.log('session restore: localStorage read', {
      storageKey,
      rawLength: raw.length,
      rawPreview: raw.slice(0, 160),
    });
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      askAiLogger.logwarn('session restore: stored value is not an array', { storageKey, typeof: typeof parsed });
      return [];
    }
    const filtered = parsed.filter(
      (m): m is PersistedAiMessage =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
    );
    askAiLogger.log('session restore: parsed stored array', {
      storageKey,
      total: parsed.length,
      valid: filtered.length,
    });
    return filtered;
  } catch (err) {
    askAiLogger.logwarn('session restore: read/parse failed', { storageKey, err: String(err) });
    return [];
  }
}

function savePersistedMessages(storageKey: string, messages: PersistedAiMessage[]): void {
  try {
    let serialized: string;
    try {
      serialized = JSON.stringify(messages);
    } catch (err) {
      askAiLogger.logwarn('session save: JSON.stringify failed', { storageKey, err: String(err) });
      return;
    }
    askAiLogger.log('session save: writing to localStorage', {
      storageKey,
      count: messages.length,
      bytes: serialized.length,
      preview: serialized.slice(0, 120),
    });
    window.localStorage.setItem(storageKey, serialized);
    askAiLogger.log('session save: localStorage write ok', { storageKey, count: messages.length });
  } catch (err) {
    /* quota/unavailable — persistence is best-effort */
    askAiLogger.logwarn('session save: localStorage write failed', { storageKey, err: String(err) });
  }
}

function clearPersistedMessages(storageKey: string): void {
  try {
    askAiLogger.log('session clear: localStorage removeItem', { storageKey });
    window.localStorage.removeItem(storageKey);
  } catch (err) {
    askAiLogger.logwarn('session clear: removeItem failed', { storageKey, err: String(err) });
  }
}

/**
 * "Let DeepSeek Explain" — Pro-only feature shown in the dictionary popup.
 *
 * Matches Classic + GO behaviour:
 * - Free users see an upgrade prompt
 * - Pro users get an AI explanation of the word in context
 * - The prompt asks for a succinct explanation plus 2 translated examples
 *
 * Runs as a multi-turn chat: after the initial explanation the user can type
 * any follow-up message (free-form input) and/or tap the configured one-tap
 * preset buttons (`followUpPresets`). Follow-up turns carry the conversation
 * history so the model keeps the word/context grounding without re-assembling
 * a flat prompt.
 */
export function AiExplanation({ word, contextText, contextForm, entryFound, autoLoad = false, searchTerms, followUpPresets = [], readerContent, initialPreset, quoteChips = false, onQuotePress, demandMode = false, storageKey, onTimestampPress }: AiExplanationProps) {
  const { data: session } = useSession();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { isPro, loaded: subLoaded } = useSubscriptionContext();
  const { display } = useSettingsContext();

  const [showAi, setShowAi] = useState(demandMode);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<Set<string>>(new Set());
  const [freeFormText, setFreeFormText] = useState('');
  /** True once the persisted transcript for the current `storageKey` has been
   *  loaded (or determined to be empty). The save effect skips persisting
   *  until this is set, so the initial empty `messages` array can never
   *  overwrite a stored transcript before the restore settles. Without this
   *  the save effect writes `[]` on mount and (with React StrictMode's
   *  double-invoke) the second restore re-reads the wiped value — the chat
   *  appears empty after refresh. */
  const [restoreComplete, setRestoreComplete] = useState(false);
  const messageIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialStreamStartedRef = useRef(false);
  const prevWordRef = useRef(word);
  const loggedEmptyBubbleRef = useRef<Set<number>>(new Set());
  /** Id of the latest empty assistant placeholder, if any (for retries). */
  const emptyAssistantIdRef = useRef<number | null>(null);

  // ── "Examples from Videos" player modal state ──
  // The shared SubsSearchPlaybackModal (the same modal the subs-search results
  // rows open) renders the player; this component only tracks which example
  // chip is open. Opened by tapping an example chip in the AI chat.
  const [examplePlayerIndex, setExamplePlayerIndex] = useState<number | null>(null);

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

  // ── Persisted session (storageKey) ─────────────────────────────────────────
  // When a storageKey is supplied (per note / web page / book / video), the
  // transcript is persisted so the chat survives navigation. Restored on
  // mount / storage-key change; saved on every message change.
  useEffect(() => {
    if (!storageKey) {
      askAiLogger.log('session restore: no storageKey — transcript is ephemeral');
      setRestoreComplete(false);
      return;
    }
    // Re-arm the save gate for this storage key: the transcript must be fully
    // loaded before we allow any write (see `restoreComplete`).
    setRestoreComplete(false);
    askAiLogger.log('session restore: storageKey present, restoring messages', {
      storageKey,
      currentMessages: messages.length,
    });
    const saved = loadPersistedMessages(storageKey);
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
    emptyAssistantIdRef.current = null;
    loggedEmptyBubbleRef.current = new Set();
    reset();
    setRestoreComplete(true);
    askAiLogger.log('session restore: restored messages into state', {
      storageKey,
      restoredCount: restored.length,
      restoredRoles: restored.map((m) => m.role),
      restoreComplete: true,
    });
  }, [storageKey, reset]);

  useEffect(() => {
    if (!storageKey) return;
    // GATE: never persist the initial empty `messages` over a stored
    // transcript. `restoreComplete` is false until the restore effect has
    // loaded the current storageKey, so the mount-time save (messages = [])
    // is skipped instead of writing `[]` to storage and wiping the previous
    // session (which React StrictMode then re-reads as empty on its second
    // restore pass).
    if (!restoreComplete) {
      askAiLogger.log('session save: skipped (restore not complete)', {
        storageKey,
        restoreComplete,
        inMemoryCount: messages.length,
      });
      return;
    }
    // Persist only role/text/label — NOT `prompt`, which embeds the full
    // text/book context for content-carrying turns and would blow past the
    // localStorage quota on a large book, silently failing to save. Regenerate
    // is hidden for restored turns (they have no prompt).
    const persisted = messages
      .filter((m) => (m.role === 'user' ? !!(m.text || m.label) : !!m.text))
      .map((m) => ({ role: m.role, text: m.text, label: m.label }));
    askAiLogger.log('session save: effect fired', {
      storageKey,
      restoreComplete,
      inMemoryCount: messages.length,
      persistedCount: persisted.length,
    });
    savePersistedMessages(storageKey, persisted);
  }, [messages, storageKey, restoreComplete]);

  /** Clear the persisted transcript (and drop the stored copy). */
  const handleClear = useCallback(() => {
    setMessages([]);
    setStreamingId(null);
    setUsedFollowUps(new Set());
    setFreeFormText('');
    emptyAssistantIdRef.current = null;
    loggedEmptyBubbleRef.current = new Set();
    initialStreamStartedRef.current = false;
    setRestoreComplete(true);
    askAiLogger.log('session clear: user cleared the chat', { storageKey });
    if (storageKey) {
      askAiLogger.log('session clear: clearing persisted messages', { storageKey });
      clearPersistedMessages(storageKey);
    }
    reset();
  }, [storageKey, reset]);

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

    // Shared assembly (SPEC-035): strips trailing context punctuation, picks the
    // context-form/context/plain template, appends the morphology instruction
    // for non-inflecting L2s, and appends the backtick-formatting instruction —
    // identical on web + mobile.
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
      l2Code: l2.code,
    });
  }, [t, l1.code, l2.code, word, contextText, contextForm]);

  const buildPresetPrompt = useCallback((preset: AiFollowUpPreset & { kind: 'prompt' }): string => {
    const l1Name = languageName(l1.code, l1.code);
    const l2Name = languageName(l2.code, l1.code);
    // Strip trailing punctuation from context to avoid doubled periods.
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;
    // Reader "Ask AI": inject the preset's named content block (e.g. the
    // current page/chapter text) into the prompt template.
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
    // the target language, not interactive L2 spans — the summary-shaped ones
    // skip the backtick formatting instruction. Summary-shaped presets append
    // the summary instruction; the quote-chip instruction is appended only when
    // the chat renders quote chips (reader surfaces). A non-quoting content
    // preset (tokenized-text analyses, or the video's difficult-expressions /
    // grammar-points lists) appends the backtick instruction instead so L2
    // terms still render tokenized.
    if (contentKey) {
      const parts = [body];
      // Robust content injection: the preloaded content (subtitle transcript /
      // reader text) must reach the model. The localized template embeds it via
      // {text}, but a stale or truncated message source can drop {text} (the
      // CSV→JSON pipeline used to truncate multi-line template values) — which
      // made the video preset prompts reply "please provide the subtitles".
      // Append the content explicitly when the template did not already
      // substitute it, so the model is never asked to analyze text it was not
      // given. `body.includes(text)` guards against a double-injection when the
      // template DID embed {text}.
      if (text && !body.includes(text)) {
        parts.push(text);
      }
      if (preset.summaryInstruction !== false) parts.push(READER_AI_SUMMARY_INSTRUCTION);
      // Video non-summary presets (difficult expressions / grammar points):
      // the transcript is a long per-line feed, so constrain the model to a
      // curated list (≤20) with no summary intro, instead of explaining every
      // line.
      if (preset.summaryInstruction === false && onTimestampPress) {
        parts.push(VIDEO_AI_CONCISE_ITEMS_INSTRUCTION);
      }
      if (quoteChips) parts.push(READER_AI_QUOTE_INSTRUCTION);
      else if (onTimestampPress) {
        parts.push(VIDEO_AI_TIMESTAMP_INSTRUCTION);
        // Video non-summary presets (difficult expressions / grammar points)
        // list discrete L2 items — wrap them in backticks so they render as
        // interactive tokenized text. Summary-shaped presets stay as prose (a
        // summary is not a set of clickable spans).
        if (preset.summaryInstruction === false) {
          const ticksPrompt = t('prompt.explain_ticks', { l2Name });
          if (ticksPrompt) parts.push(ticksPrompt);
        }
      }
      else {
        const ticksPrompt = t('prompt.explain_ticks', { l2Name });
        if (ticksPrompt) parts.push(ticksPrompt);
      }
      return parts.join('\n\n');
    }
    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return [body, ticksPrompt].filter(Boolean).join('\n\n');
  }, [t, l1.code, l2.code, word, contextText, contextForm, readerContent, quoteChips, onTimestampPress]);

  const fetchExplanation = useCallback(() => {
    // Reader "Ask AI": stream the initial preset instead of the word explain.
    const prompt = initialPreset ? buildPresetPrompt(initialPreset) : buildPrompt();
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
  }, [stream, buildPrompt, buildPresetPrompt, initialPreset, word, appendMessage, updateMessage]);

  const handleRegenerate = useCallback((messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    const prompt = target.prompt ?? buildPrompt();
    updateMessage(messageId, { text: '', prompt });
    setStreamingId(messageId);
    log('AI explain stream start (regenerate)', { word, messageId });
    stream(prompt, { regenerate: true });
  }, [stream, buildPrompt, word, messages, updateMessage]);

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

  // Reader "Ask AI": stable config for rendering [[original||translation]]
  // quote chips inline. Memoized (not recreated per message/effect) so the
  // MarkdownExplanation `components` object keeps a stable identity and
  // doesn't remount tokenized spans on every re-render. Every marker renders
  // as a tappable chip (the model is asked to quote exactly; a chip whose
  // passage isn't verbatim simply opens a search that finds nothing rather
  // than dropping the quote and leaving a gap).
  const readerQuoteChipsConfig = useMemo(() => {
    if (!quoteChips || !onQuotePress) return undefined;
    return { onQuotePress };
  }, [quoteChips, onQuotePress]);

  // ── "Examples from Videos" follow-up ──
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
        `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(term)}&l2=${baseCode(l2.code)}&limit=${AI_EXAMPLES_LIMIT}&context=3`,
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
            notes: parseNotes(v.notes),
            matchLineIndex: findMatchLine(lines, term),
          };
        })
        .filter((v) => v.subs_l2.length > 0 && v.matchLineIndex >= 0);
    },
    [l2.code],
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

      const l1Name = languageName(l1.code, l1.code);
      const l2Name = languageName(l2.code, l1.code);
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
  }, [word, contextForm, contextText, searchTerms, l1.code, l2.code, t, appendMessage, updateMessage, fetchSubsSearch]);

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
    askAiLogger.log('AI explain follow-up prompt', {
      labelKey: preset.labelKey,
      promptKey: preset.promptKey,
      contentKey: preset.contentKey ?? null,
      readerTextChars: (readerContent?.text ?? '').length,
      promptChars: prompt.length,
      history: history.length,
      promptHasTimestamp: /\[\d{1,2}:\d{2}\]/.test(prompt),
      promptPreview: prompt.slice(0, 400),
    });
    appendMessage({
      role: 'user',
      text: '',
      label: t(preset.labelKey),
    });
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    log('AI explain follow-up stream start', {
      word,
      promptKey: preset.promptKey,
      history: history.length,
    });
    stream(prompt, { messages: history });
  }, [buildPresetPrompt, stream, word, appendMessage, t, handleExamplesFollowUp, buildHistory]);

  const handleSendFreeForm = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setFreeFormText('');
    const history = buildHistory();
    // Reader "Ask AI": preload the full text/book as follow-up context so the
    // model grounds the answer in the whole surface, not just the prior turns.
    const contextText = readerContent?.text ?? '';
    const quoteInstr = quoteChips ? `\n\n${READER_AI_QUOTE_INSTRUCTION}` : '';
    const tsInstr = onTimestampPress ? `\n\n${VIDEO_AI_TIMESTAMP_INSTRUCTION}` : '';
    const prompt = contextText
      ? `Here is the complete text to use as context when answering:\n\n${contextText}\n\nQuestion: ${text}${quoteInstr}${tsInstr}`
      : quoteChips
        ? `${text}\n\n${READER_AI_QUOTE_INSTRUCTION}`
        : onTimestampPress
          ? `${text}\n\n${VIDEO_AI_TIMESTAMP_INSTRUCTION}`
          : text;
    askAiLogger.log('AI explain free-form prompt', {
      questionChars: text.length,
      readerTextChars: contextText.length,
      promptChars: prompt.length,
      history: history.length,
      promptHasTimestamp: /\[\d{1,2}:\d{2}\]/.test(prompt),
      promptPreview: prompt.slice(0, 400),
    });
    // Send the typed message as the new user turn; the prior conversation
    // (reconstructed above) grounds it in the word/context already discussed.
    appendMessage({ role: 'user', text, label: text, prompt });
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    log('AI explain free-form stream start', { word, chars: text.length, contextChars: contextText.length, history: history.length });
    stream(prompt, { messages: history });
  }, [stream, word, appendMessage, buildHistory, quoteChips, readerContent, onTimestampPress]);

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

  // ── Example player modal ──
  // The shared SubsSearchPlaybackModal (same component + behavior as the
  // subs-search results rows) handles the player, controls, and subtitles.
  // This component only opens it on the tapped example chip's video.
  const openExamplePlayer = useCallback((index: number) => {
    setExamplePlayerIndex(index);
  }, []);

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
    // A persisted session (storageKey) is keyed by the entity, not the
    // word/title — a mid-load title change (e.g. an epub file name resolving
    // after the book loads) must not wipe the restored transcript.
    if (storageKey) return;
    initialStreamStartedRef.current = false;
    loggedEmptyBubbleRef.current = new Set();
    emptyAssistantIdRef.current = null;
    setMessages([]);
    setStreamingId(null);
    setUsedFollowUps(new Set());
    reset();
  }, [word, reset, storageKey]);

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
    if (demandMode) return; // reader Ask-AI: no auto response — user must act
    if ((showAi || autoLoad) && isPro && subLoaded && !explanation && !loading) {
      if (initialStreamStartedRef.current) return;
      initialStreamStartedRef.current = true;
      fetchExplanation();
    }
  }, [demandMode, showAi, autoLoad, isPro, subLoaded, explanation, loading, fetchExplanation]);

  // Pro gate — free user (skip the gate while still loading — show the button optimistically)
  if (subLoaded && !isPro && (showAi || autoLoad || demandMode)) {
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
  if (!subLoaded && (showAi || autoLoad || demandMode)) {
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
  if (!showAi && !autoLoad && !demandMode) {
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
  if (demandMode || messages.length > 0 || loading || error) {
    return (
      <div>
        {readerContent && (readerContent.text?.length ?? 0) > READER_AI_CONTEXT_WARN_MAX && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('msg.reader_context_too_large')}</span>
          </div>
        )}
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            {t('label.ai_says')}
            {loading && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
          </div>
          {storageKey && messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" />
              {t('action.clear_conversation')}
            </button>
          )}
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
                const quoteChipsConfig =
                  readerQuoteChipsConfig && message.text ? readerQuoteChipsConfig : undefined;
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
                          quoteChips={quoteChipsConfig}
                          timestampChips={onTimestampPress ? { onTimestampPress } : undefined}
                        />
                      </div>
                    ) : null}
                    {isExamplesMessage && (
                      <div className="mt-2 space-y-2">
                        {message.pattern && (
                          <div className="rounded-lg border border-border bg-muted/60 px-2 py-1">
                            <div className="text-[11px] font-semibold text-foreground">
                              {message.pattern.heading}
                            </div>
                            {message.pattern.pattern && (
                              <div className="text-[10px] text-muted-foreground">
                                {message.pattern.pattern}
                              </div>
                            )}
                          </div>
                        )}
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
                      {!isExamplesMessage && message.prompt && (
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
        {followUpPresets.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {followUpPresets
              .filter((p) => !usedFollowUps.has(presetKey(p)))
              .map((p) => (
                <Button
                  key={presetKey(p)}
                  variant="secondary"
                  size="sm"
                  className="rounded-lg rounded-br-none border border-border shadow-sm"
                  disabled={loading}
                  onClick={() => handleFollowUp(p)}
                >
                  {t(p.labelKey)}
                </Button>
              ))}
          </div>
        )}

        {/* Free-form follow-up input — lets the user ask anything about the
            word/phrase in the ongoing multi-turn chat. Disabled while a reply
            is streaming so turns stay ordered. */}
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendFreeForm(freeFormText);
          }}
        >
          <input
            type="text"
            value={freeFormText}
            onChange={(e) => setFreeFormText(e.target.value)}
            placeholder={t('placeholder.ask_follow_up')}
            disabled={loading}
            className="h-9 w-full flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            type="submit"
            size="sm"
            className="shrink-0 gap-2"
            disabled={loading || !freeFormText.trim()}
          >
            <Send className="h-4 w-4" />
            {t('action.send')}
          </Button>
        </form>

        {/* ── Example player modal — the same shared modal the subs-search
            results rows open (header, mini player, controls, subtitles with
            singleline | multiline toggle). Rendered through a portal to the
            body, so it sizes against the viewport even when opened from the
            dictionary popup dialog. Opened by tapping an example chip. ── */}
        <SubsSearchPlaybackModal
          videos={exampleVideos.map((ex) => ex.video)}
          index={examplePlayerIndex}
          onIndexChange={setExamplePlayerIndex}
          highlightTerms={[word]}
        />
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}
