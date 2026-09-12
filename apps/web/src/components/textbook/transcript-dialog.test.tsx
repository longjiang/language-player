// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider } from './task-provider';
import { TaskAudioProvider } from './task-audio';
import { TranscriptDialogProvider } from './transcript-dialog';
import { InlineTrackButton } from './inline-track-button';
import { NumberedBlanks } from './numbered-blanks';
import { AudioPlayer } from './audio-player';

/**
 * The transcript button and its dialog (SPEC-095 §Transcript).
 *
 * Each line must reach the dialog through `TokenizedText` rather than as a string, because
 * that is what makes the transcript the same L2 text as the rest of the app — readings
 * above the characters and every word tappable into the dictionary. A transcript rendered
 * as a blob would pass a text assertion and still be the wrong feature, so the assertion
 * is made against the tokenized element.
 */
vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

const language = { l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } };
vi.mock('@/providers/language-provider', () => ({ useLanguage: () => language }));

let translationOn = false;
vi.mock('@/providers/settings-provider', () => ({
  useSettingsContext: () => ({ getL2: () => ({ display: { translation: translationOn } }) }),
}));

const translateTexts = vi.fn(async ({ texts }: { texts: string[] }) =>
  texts.map((t) => `EN:${t.slice(0, 6)}`),
);
vi.mock('@langplayer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@langplayer/utils')>()),
  translateTexts: (...args: unknown[]) => translateTexts(...(args as [{ texts: string[] }])),
}));

async function task(id: string): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  if (!book) throw new Error('book tblt-hsk4 did not load');
  const found = findTask(book, id);
  if (!found) throw new Error(`task ${id} did not resolve`);
  return { book, task: found };
}

/** The real nesting: the task's store, its one player, and the transcript dialog. */
async function renderTask(t: Task, book: BookMeta, ui: React.ReactElement) {
  const view = render(
    <TextbookTaskProvider task={t} book={book}>
      <TaskAudioProvider task={t}>
        <TranscriptDialogProvider>{ui}</TranscriptDialogProvider>
      </TaskAudioProvider>
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return view;
}

const transcriptButton = () => document.querySelector('button[aria-label="title.transcript"]');

async function openTranscript() {
  const button = transcriptButton();
  expect(button).not.toBeNull();
  await act(async () => {
    (button as HTMLButtonElement).click();
  });
  await act(async () => {});
}

beforeEach(() => {
  translationOn = false;
  translateTexts.mockClear();
  // jsdom has no media stack; the provider pauses its element on unmount.
  HTMLMediaElement.prototype.pause = vi.fn();
});

describe('a recording that has a transcript', () => {
  it('offers a transcript button beside its play control (A ➋ ②)', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.A.t2');
    await renderTask(t, book, <InlineTrackButton tracks={t.blanks!.b2!.audio} />);
    expect(transcriptButton()).not.toBeNull();
  });

  it('shows the recording’s transcript, a tokenized line at a time', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.A.t2');
    await renderTask(t, book, <InlineTrackButton tracks={t.blanks!.b2!.audio} />);
    await openTranscript();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // ② is the 全列禁烟 announcement; the speaker is its setting, which is the
    // distinction the task tests.
    expect(dialog!.textContent).toContain('车内广播');
    const tokenized = [...dialog!.querySelectorAll('[data-tokenized]')].map((n) => n.textContent);
    expect(tokenized).toEqual([
      '欢迎您乘坐复兴号动车组列车。本次列车全列禁烟。请不要在车厢内和厕所内吸烟。' +
        '列车环境关系每一位旅客的出行体验，需要大家共同营造和维护。',
    ]);
  });

  it('keeps every line of a conversation, with its speakers (A ➌ ①)', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.A.t3');
    const row = t.body.find((s) => s.kind === 'dataTable')!.rows[0]!;
    await renderTask(t, book, <InlineTrackButton tracks={row.audio} />);
    await openTranscript();

    const dialog = document.querySelector('[role="dialog"]')!;
    const tokenized = [...dialog.querySelectorAll('[data-tokenized]')].map((n) => n.textContent);
    expect(tokenized).toHaveLength(3);
    expect(tokenized[0]).toContain('共享单车可以随处借');
    expect(tokenized[1]).toContain('那不是很远？');
    expect(dialog.textContent).toContain('李婷婷');
    expect(dialog.textContent).toContain('听者');
  });

  it('translates each line when the per-L2 translation setting is on', async () => {
    translationOn = true;
    const { book, task: t } = await task('tblt-hsk4.u06.A.t3');
    const row = t.body.find((s) => s.kind === 'dataTable')!.rows[0]!;
    await renderTask(t, book, <InlineTrackButton tracks={row.audio} />);
    await openTranscript();

    expect(translateTexts).toHaveBeenCalledTimes(1);
    // One request for the whole transcript, and the L1 line under each L2 line.
    expect((translateTexts.mock.calls[0]![0] as { texts: string[] }).texts).toHaveLength(3);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('EN:在北京还是共');
  });

  it('makes one request per opening, not per line', async () => {
    translationOn = true;
    const { book, task: t } = await task('tblt-hsk4.u06.A.t3');
    const row = t.body.find((s) => s.kind === 'dataTable')!.rows[0]!;
    await renderTask(t, book, <InlineTrackButton tracks={row.audio} />);
    await openTranscript();
    expect(translateTexts.mock.calls.length).toBe(1);
  });
});

describe('a recording with no transcript', () => {
  it('renders no transcript button, so the play control stands alone (E ➊ ①)', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.E.t1');
    await renderTask(t, book, <InlineTrackButton tracks={t.blanks!.b1!.audio} />);
    // Dictation: the recording says the sentence the student writes, so a transcript
    // there is the answer key with a play button.
    expect(transcriptButton()).toBeNull();
    expect(document.querySelector('button[aria-pressed]')).not.toBeNull();
  });

  it('renders none for the one D recording whose text the page never prints', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.D.t5');
    await renderTask(t, book, <InlineTrackButton tracks={t.audio} />);
    expect(transcriptButton()).toBeNull();
  });
});

describe('a task that replays another task’s recording', () => {
  it('offers the transcript declared where the recording is first used (A ➍)', async () => {
    // A ➍ replays A ➌'s five files and declares no transcript of its own; the book
    // indexes transcripts by recording, so the button is there anyway.
    const { book, task: t } = await task('tblt-hsk4.u06.A.t4');
    const passage = t.body.find((s) => s.kind === 'passage')!;
    await renderTask(t, book, <InlineTrackButton tracks={passage.audio} />);
    await openTranscript();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('卢沟桥');
  });
});

/**
 * The layout the control imposes on its widgets: play and transcript read as ONE control,
 * and an item prints its number before it. Both are the kind of thing a later refactor
 * undoes silently, and both are cheap to state.
 */
describe('the control’s shape', () => {
  it('prints an item’s number before its control, then the blank', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.A.t2');
    // The blank widget is not what is under test here — its own position in the row is.
    vi.doMock('./blank-field', () => ({
      BlankField: ({ blank }: { blank: { id: string } }) => <span data-blank={blank.id} />,
    }));
    await renderTask(t, book, <NumberedBlanks ids={['b1', 'b2']} />);

    const row = document.querySelector('ol li')!;
    const order = [...row.children].map((child) =>
      child.tagName === 'SPAN' && child.textContent?.includes('①')
        ? 'number'
        : child.querySelector('button')
          ? 'control'
          : 'blank',
    );
    expect(order).toEqual(['number', 'control', 'blank']);
  });

  it('puts play and transcript in one pill rather than two loose buttons', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.A.t2');
    await renderTask(t, book, <InlineTrackButton tracks={t.blanks!.b2!.audio} />);

    const transcript = transcriptButton()!;
    const play = document.querySelector('button[aria-pressed]')!;
    const pill = play.parentElement!;

    expect(pill).toBe(transcript.parentElement);
    expect(pill.className).toContain('rounded-full');
    expect(pill.className).toContain('border');
    expect(pill.className).toContain('divide-x');
  });

  it('gives a recording with no transcript a one-segment pill, not a gap', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.E.t1');
    await renderTask(t, book, <InlineTrackButton tracks={t.blanks!.b1!.audio} />);
    const play = document.querySelector('button[aria-pressed]')!;
    expect(play.parentElement!.querySelectorAll('button')).toHaveLength(1);
  });
});

/**
 * A task's own audio row (A ➊ has nine recordings). It reads exactly like a numbered item
 * row — `① [▶|▤]` — because the nine tracks are nine questions, and the number used to be
 * the play button: a circled numeral does not read as "play".
 */
describe('a task’s audio row', () => {
  it('prints each track’s number outside a pill whose play segment is a play button', async () => {
    const { book, task: t } = await task('tblt-hsk4.u06.A.t1');
    await renderTask(t, book, <AudioPlayer tracks={t.audio!} />);

    const row = document.querySelector('section .flex-wrap')!;
    expect(row.children).toHaveLength(t.audio!.length);

    const first = row.children[0]!;
    const numeral = first.firstElementChild!;
    const pill = first.lastElementChild!;

    expect(numeral.textContent).toBe('①');
    // Decoration: the pill's accessible name carries the track, the number does not.
    expect(numeral.getAttribute('aria-hidden')).toBe('true');
    expect(pill.querySelectorAll('button')).toHaveLength(2);
    expect(pill.querySelector('button')!.getAttribute('aria-label')).toBe('上海');
    expect(pill.querySelector('button[aria-label="title.transcript"]')).not.toBeNull();
  });
});
