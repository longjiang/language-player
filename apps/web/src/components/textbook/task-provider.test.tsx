// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { act } from 'react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, useTextbookTask, TEXTBOOK_STORAGE_PREFIX } from './task-provider';

/**
 * A blank, read exactly as `BlankField` reads it: through the store, with the same
 * function for both the client and the server snapshot.
 *
 * That is the shape that produced the reported hydration failure, so the test has to
 * keep it rather than paper over it with a server-snapshot that returns nothing.
 */
function Blank({ id }: { id: string }) {
  const ctx = useTextbookTask()!;
  const read = () => ctx.store.getValue(id);
  const value = useSyncExternalStore(ctx.store.subscribe, read, read);
  return <span data-testid="blank">{value}</span>;
}

let consoleError: ReturnType<typeof vi.spyOn>;
let container: HTMLDivElement;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  consoleError.mockRestore();
  container.remove();
  window.localStorage.clear();
});

async function taskA2(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  if (!book) throw new Error('book tblt-hsk4 did not load');
  const task = findTask(book, 'tblt-hsk4.u06.A.t2');
  if (!task) throw new Error('task A ➋ did not resolve');
  return { book, task };
}

function seedSavedAttempt(book: BookMeta, task: Task, responses: Record<string, string>) {
  window.localStorage.setItem(
    TEXTBOOK_STORAGE_PREFIX + task.id,
    JSON.stringify({ taskId: task.id, contentVersion: book.contentVersion, responses, attempts: [] }),
  );
}

/** Messages React reported while hydrating, if any. */
const hydrationErrors = () =>
  consoleError.mock.calls
    .map((args) => String(args[0]))
    .filter((text) => /hydrat/i.test(text));

/** Server-render the tree into the container, then hydrate it — as a page load does. */
async function serverRenderThenHydrate(tree: React.ReactElement): Promise<string> {
  const html = renderToString(tree);
  container.innerHTML = html;
  await act(async () => {
    hydrateRoot(container, tree);
  });
  await act(async () => {});
  return html;
}

describe('resuming a task the browser has a saved attempt for', () => {
  it('hydrates the saved answers without a mismatch, and shows them afterwards', async () => {
    const { book, task } = await taskA2();
    // The student answered ② = E in an earlier session, so the browser holds it while
    // the server has no idea it exists.
    seedSavedAttempt(book, task, { b2: 'E' });

    const tree = (
      <TextbookTaskProvider task={task} book={book}>
        <Blank id="b2" />
      </TextbookTaskProvider>
    );

    const html = await serverRenderThenHydrate(tree);

    // The server rendered an unanswered task: it cannot reach device storage.
    expect(html).not.toContain('>E<');

    // The defect: the store read localStorage while rendering, so the client's first
    // render already had `E` while the server had sent an empty blank. React threw the
    // whole tree away and logged "Hydration failed because the server rendered text
    // didn't match the client" — and the recovery re-render is what produced the
    // "Encountered a script tag while rendering React component" warning that came with
    // it.
    expect(hydrationErrors()).toEqual([]);

    // …and the saved answer still arrives, which is the point of resuming.
    expect(container.textContent).toBe('E');
  });

  it('does not write an empty attempt over the saved one before adopting it', async () => {
    const { book, task } = await taskA2();
    seedSavedAttempt(book, task, { b2: 'E', b3: 'D' });
    const key = TEXTBOOK_STORAGE_PREFIX + task.id;

    await serverRenderThenHydrate(
      <TextbookTaskProvider task={task} book={book}>
        <Blank id="b2" />
      </TextbookTaskProvider>,
    );

    // A store that starts empty must not persist that emptiness: doing so would erase
    // the saved attempt — b3 included — in the window before it is adopted.
    const saved = JSON.parse(window.localStorage.getItem(key)!) as {
      responses: Record<string, string>;
    };
    expect(saved.responses).toEqual({ b2: 'E', b3: 'D' });
  });

  it('restores the saved attempt on the first render of a client-side navigation', async () => {
    const { book, task } = await taskA2();
    seedSavedAttempt(book, task, { b2: 'E' });

    // No server HTML is involved when a student navigates between tasks in the app, so
    // there is nothing to disagree with and the saved answer must be there at once —
    // not after a frame of empty task, which is what deferring hydration would cost.
    await act(async () => {
      createRoot(container).render(
        <TextbookTaskProvider task={task} book={book}>
          <Blank id="b2" />
        </TextbookTaskProvider>,
      );
    });

    expect(container.textContent).toBe('E');
    expect(hydrationErrors()).toEqual([]);
  });
});
