/**
 * Multi-turn history for the AI explanation chat (`AiExplanation`, web + mobile).
 *
 * Both apps reconstruct the conversation they send to `POST /chatgpt/stream`
 * from the same rendered transcript, so the logic lives here rather than being
 * duplicated per platform. `apps/web` and `apps/mobile` (SPEC-035) share it
 * exactly as they share the prompt builders in `ai-prompts.ts`.
 *
 * The transcript is the single source of truth: every assistant reply carries
 * the exact request that produced it, and the history of a follow-up turn is
 * rebuilt from the replies above it. Nothing is accumulated separately, which
 * is what lets `regenerate` rewrite history — it drops every turn after the
 * regenerated reply and rebuilds the history from the turns that survive.
 */

import type { SubsSearchVideo } from '@langplayer/shared';
import {
  READER_AI_QUOTE_INSTRUCTION,
  VIDEO_AI_TIMESTAMP_INSTRUCTION,
} from './ai-quotes';

/** One AI-selected video example: the search result (for the chip) plus the
 *  LLM's explanation of the word's usage in that line. */
export interface AiVideoExampleData {
  video: SubsSearchVideo;
  explanation: string;
}

/**
 * The fields of a chat transcript entry the history builder needs.
 *
 * The platform components' own `ChatMessage` is structurally compatible with
 * this, so they can pass their message arrays straight in.
 */
export interface AiChatHistoryMessage {
  role: 'user' | 'assistant';
  /** The reply text (assistant) or the typed message (free-form user turn). */
  text: string;
  /** Translated label shown in the user bubble (preset follow-ups). */
  label?: string;
  /** The exact request that produced this assistant reply — this is what makes
   *  the conversation's original prompt (and every earlier request) part of
   *  each later turn instead of a flat re-prompt. Not persisted for
   *  content-carrying reader turns (see the storage note in SPEC-035), so
   *  restored turns fall back to `label`. */
  prompt?: string;
  /** "Examples from Videos" replies render as chips rather than `text`. */
  examples?: AiVideoExampleData[];
  /** The usage pattern the LLM identified for the examples above. */
  pattern?: { heading: string; pattern: string };
}

/** One turn of the prior conversation sent with a follow-up request. */
export interface AiChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Serialize an "Examples from Videos" reply into a plain assistant turn.
 *
 * That reply has no streamed `text` (it renders as a pattern header plus
 * example chips), so skipping it would leave the history with two consecutive
 * `user` turns — a question with no reply before the next question. That does
 * not merely lose detail; it breaks the conversation context outright.
 */
export function serializeExamplesTurn(message: AiChatHistoryMessage): string {
  if (!message.examples || message.examples.length === 0) return message.text;
  const parts: string[] = [];
  if (message.text) parts.push(message.text);
  if (message.pattern) {
    parts.push(
      message.pattern.pattern
        ? `${message.pattern.heading} (${message.pattern.pattern})`
        : message.pattern.heading,
    );
  }
  for (const ex of message.examples) {
    const line = ex.video.subs_l2[ex.video.matchLineIndex]?.line ?? '';
    const title = ex.video.title ? `${ex.video.title}: ` : '';
    parts.push(`- ${title}${line}${ex.explanation ? ` — ${ex.explanation}` : ''}`);
  }
  return parts.join('\n');
}

/**
 * Reconstruct the conversation strictly before `count` messages as
 * `{ role, content }` turns for the multi-turn endpoint.
 *
 * Passing an explicit length (rather than reading the component's live
 * transcript) is what lets a regenerate send the history of the turns its
 * truncation keeps, without waiting for the state update to commit.
 *
 * Still-empty in-flight placeholders are skipped entirely — an empty assistant
 * turn is rejected by the API.
 */
export function buildAiChatHistory(
  messages: readonly AiChatHistoryMessage[],
  count: number = messages.length,
): AiChatHistoryTurn[] {
  const turns: AiChatHistoryTurn[] = [];
  const limit = Math.max(0, Math.min(count, messages.length));
  for (let i = 0; i < limit; i++) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const content = m.examples && m.examples.length > 0 ? serializeExamplesTurn(m) : m.text;
    // A still-empty in-flight placeholder contributes nothing — an empty
    // assistant turn is rejected by the API, so skip the pair entirely.
    if (!content) continue;
    const ask = userTurnContent(m, messages[i - 1]);
    if (ask) turns.push({ role: 'user', content: ask });
    turns.push({ role: 'assistant', content });
  }
  return turns;
}

/**
 * The user turn that opened an assistant reply.
 *
 * The reply's own stored prompt is the exact request that produced it (it
 * carries the full word/reader/video context, which is why it is used first).
 * Restored turns have no stored prompt — the transcript persists only
 * role/text/label, because a content-carrying prompt would blow the storage
 * quota — so fall back to the user bubble immediately above, which is where a
 * preset's translated label lives.
 */
function userTurnContent(
  assistantMessage: AiChatHistoryMessage,
  preceding?: AiChatHistoryMessage,
): string {
  if (assistantMessage.prompt) return assistantMessage.prompt;
  if (preceding && preceding.role === 'user') return preceding.label || preceding.text;
  return assistantMessage.label || assistantMessage.text;
}

/**
 * Assemble a free-form turn's request.
 *
 * Shared by the send handler and by regenerate: a reader/video turn wraps the
 * typed question in a large preloaded-content preamble, and re-issuing the
 * frozen request string would regenerate against a stale copy of the surface.
 * Rebuilding it around the question the user actually typed keeps the
 * regenerated turn grounded in the CURRENT content.
 */
export function buildFreeFormPrompt(
  question: string,
  readerText: string,
  quoteChips: boolean,
  onTimestampPress?: (timeSeconds: number) => void,
): string {
  const quoteInstr = quoteChips ? `\n\n${READER_AI_QUOTE_INSTRUCTION}` : '';
  const tsInstr = onTimestampPress ? `\n\n${VIDEO_AI_TIMESTAMP_INSTRUCTION}` : '';
  if (readerText) {
    return `Here is the complete text to use as context when answering:\n\n${readerText}\n\nQuestion: ${question}${quoteInstr}${tsInstr}`;
  }
  if (quoteChips) return `${question}\n\n${READER_AI_QUOTE_INSTRUCTION}`;
  if (onTimestampPress) return `${question}\n\n${VIDEO_AI_TIMESTAMP_INSTRUCTION}`;
  return question;
}
