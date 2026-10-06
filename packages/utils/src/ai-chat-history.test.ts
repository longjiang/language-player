import { describe, expect, it } from 'vitest';
import {
  buildAiChatHistory,
  buildFreeFormPrompt,
  serializeExamplesTurn,
  type AiChatHistoryMessage,
} from './ai-chat-history';
import {
  READER_AI_QUOTE_INSTRUCTION,
  VIDEO_AI_TIMESTAMP_INSTRUCTION,
} from './ai-quotes';

/** Minimal SubsSearchVideo stub — only the fields the serializer reads. */
function video(id: number, title: string, line: string): any {
  return {
    id,
    title,
    subs_l2: [{ line, starttime: 0 }],
    matchLineIndex: 0,
  };
}

const user = (text: string, extra: Partial<AiChatHistoryMessage> = {}): AiChatHistoryMessage => ({
  role: 'user',
  text,
  ...extra,
});

const assistant = (
  text: string,
  extra: Partial<AiChatHistoryMessage> = {},
): AiChatHistoryMessage => ({ role: 'assistant', text, ...extra });

describe('buildAiChatHistory', () => {
  it('pairs each assistant reply with the request that produced it', () => {
    const messages = [
      assistant('The word means "to operate".', { prompt: 'Explain the word run' }),
      user('What about the past tense?'),
      assistant('The past tense is "ran".', { prompt: 'What about the past tense?' }),
    ];

    expect(buildAiChatHistory(messages)).toEqual([
      { role: 'user', content: 'Explain the word run' },
      { role: 'assistant', content: 'The word means "to operate".' },
      { role: 'user', content: 'What about the past tense?' },
      { role: 'assistant', content: 'The past tense is "ran".' },
    ]);
  });

  it('keeps the original prompt as context for every later turn', () => {
    const messages = [
      assistant('First answer.', { prompt: 'ORIGINAL PROMPT' }),
      user('follow-up one'),
      assistant('Second answer.', { prompt: 'follow-up one' }),
      user('follow-up two'),
      assistant('Third answer.', { prompt: 'follow-up two' }),
    ];

    const turns = buildAiChatHistory(messages);
    // The original prompt is the opening user turn of the whole conversation,
    // so it is present in every request that sends this history.
    expect(turns[0]).toEqual({ role: 'user', content: 'ORIGINAL PROMPT' });
    expect(turns).toHaveLength(6);
  });

  it('includes an Examples from Videos turn instead of leaving two user turns', () => {
    const messages = [
      assistant('Initial explanation.', { prompt: 'ORIGINAL' }),
      user('', { label: 'Examples from Videos' }),
      assistant('', {
        examples: [{ video: video(1, 'Clip', 'I run a company'), explanation: 'manage' }],
        pattern: { heading: 'to manage', pattern: 'run + object' },
      }),
      user('What about the noun?'),
      assistant('The noun is "a run".', { prompt: 'What about the noun?' }),
    ];

    const turns = buildAiChatHistory(messages);
    const roles = turns.map((t) => t.role);
    // No two consecutive user turns — the examples reply is carried as context.
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1]);
    }
    expect(turns[2]).toEqual({
      role: 'user',
      content: 'Examples from Videos',
    });
    const examplesTurn = turns[3];
    expect(examplesTurn?.role).toBe('assistant');
    expect(examplesTurn?.content).toContain('to manage');
    expect(examplesTurn?.content).toContain('run + object');
    expect(examplesTurn?.content).toContain('I run a company');
    expect(examplesTurn?.content).toContain('manage');
  });

  it('stops at `count` so regenerate can rebuild only the surviving turns', () => {
    const messages = [
      assistant('First answer.', { prompt: 'ORIGINAL' }),
      user('second'),
      assistant('Second answer.', { prompt: 'second' }),
      user('third'),
      assistant('Third answer.', { prompt: 'third' }),
    ];

    // Regenerating index 2 (the second answer) keeps turns 0..2; the history it
    // sends is the conversation strictly before it.
    expect(buildAiChatHistory(messages, 2)).toEqual([
      { role: 'user', content: 'ORIGINAL' },
      { role: 'assistant', content: 'First answer.' },
    ]);
    // Regenerating the very first reply sends no history at all (single turn).
    expect(buildAiChatHistory(messages, 0)).toEqual([]);
  });

  it('clamps a count past the end and ignores a negative count', () => {
    const messages = [assistant('Only answer.', { prompt: 'ORIGINAL' })];
    expect(buildAiChatHistory(messages, 99)).toHaveLength(2);
    expect(buildAiChatHistory(messages, -1)).toEqual([]);
  });

  it('skips still-empty in-flight placeholders', () => {
    const messages = [
      assistant('First answer.', { prompt: 'ORIGINAL' }),
      assistant('', { prompt: 'in flight' }),
    ];
    expect(buildAiChatHistory(messages)).toEqual([
      { role: 'user', content: 'ORIGINAL' },
      { role: 'assistant', content: 'First answer.' },
    ]);
  });

  it('falls back to the bubble label for a restored turn with no prompt', () => {
    const messages = [user('', { label: 'Inflection' }), assistant('It inflects as…')];
    expect(buildAiChatHistory(messages)).toEqual([
      { role: 'user', content: 'Inflection' },
      { role: 'assistant', content: 'It inflects as…' },
    ]);
  });

  it('ignores a standalone user bubble that has no assistant reply', () => {
    expect(buildAiChatHistory([assistant('Answer.', { prompt: 'Q' }), user('dangling')])).toEqual([
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'Answer.' },
    ]);
  });
});

describe('serializeExamplesTurn', () => {
  it('omits the title prefix when the video has no title', () => {
    const text = serializeExamplesTurn({
      role: 'assistant',
      text: '',
      examples: [{ video: video(7, '', 'She runs it'), explanation: 'operate' }],
    });
    expect(text).toBe('- She runs it — operate');
  });

  it('returns the plain text for a non-examples reply', () => {
    expect(serializeExamplesTurn(assistant('plain'))).toBe('plain');
  });
});

describe('buildFreeFormPrompt', () => {
  it('returns the bare question when there is no reader context', () => {
    expect(buildFreeFormPrompt('Why?', '', false)).toBe('Why?');
  });

  it('appends the quote instruction for reader chats', () => {
    expect(buildFreeFormPrompt('Why?', '', true)).toBe(
      `Why?\n\n${READER_AI_QUOTE_INSTRUCTION}`,
    );
  });

  it('appends the timestamp instruction for video chats', () => {
    expect(buildFreeFormPrompt('Why?', '', false, () => {})).toBe(
      `Why?\n\n${VIDEO_AI_TIMESTAMP_INSTRUCTION}`,
    );
  });

  it('wraps the question in the preloaded reader text and both instructions', () => {
    const prompt = buildFreeFormPrompt('Why?', 'FULL TEXT', false, () => {});
    expect(prompt).toContain('FULL TEXT');
    expect(prompt).toContain('Question: Why?');
    expect(prompt).toContain(VIDEO_AI_TIMESTAMP_INSTRUCTION);
  });
});
