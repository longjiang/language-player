'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAssetResolver,
  isAppToHostMessage,
  isBlankCorrect,
  mockAppHref,
  protocolCompatible,
  type MockAppStimulus,
} from '@langplayer/textbooks';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Languages,
  Lightbulb,
  PartyPopper,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_BASE_URL, MOCK_APP_BASE_URL } from '@/lib/asset-url';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useMediaQuery } from '@/hooks/use-media-query';
import { RetryIcon } from './retry-icon';
import { log } from '@/lib/logger';
import { DictionaryPopup } from '@/components/dictionary-popup';
import type { LemmatizedToken } from '@langplayer/shared';
import { useTextbookTask } from './task-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/** SPEC-052's small/large boundary: a sheet below it, a centered modal at or above. */
const WIDE = '(min-width: 768px)';

/**
 * Host for a self-contained mock app (SPEC-095, ADR-0045).
 *
 * The app is not embedded in the page. The page carries one control — the launch
 * button — and the app opens in a panel over it: a bottom sheet on a narrow screen, a
 * centered modal on a wide one, which is the container policy SPEC-052 and ADR-0042
 * already set out.
 *
 * Inside the panel the host owns four things, and the app owns its screen:
 *
 * - **The task being asked**, one at a time, in the header. Six tasks in one app is
 *   only followable if the student is told which one they are on; the prompts live in
 *   the content, which is also what each reported goal is graded against.
 * - **Next** — once the app reports the current task done — and **All Done!** once
 *   every one is, which closes the panel so the student can submit.
 * - **Help mode and Hint**, in the bottom toolbar, because they act on the app.
 * - **Grading**: the app reports which goal it satisfied and with what, and the host
 *   writes that into the linked blank. A buggy or malicious app cannot mark itself
 *   correct.
 *
 * The host deliberately knows nothing about the app's UI. Adding a mock app adds no
 * host code.
 *
 * Sandboxed WITHOUT `allow-same-origin`: the app runs on an opaque origin, and
 * `postMessage` is the only channel. That is why tokens are pushed in rather than
 * fetched by the app.
 */
export function MockAppFrame({ stimulus }: { stimulus: MockAppStimulus }) {
  const ctx = useTextbookTask()!;
  const { l1, l2 } = useLanguage();
  const t = useT();
  const wide = useMediaQuery(WIDE);
  const resolveAsset = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  /** The goals that print a task, in the app's own order. */
  const questions = useMemo(
    () => stimulus.goals.flatMap((goal) => (goal.prompt ? [{ id: goal.id, prompt: goal.prompt }] : [])),
    [stimulus.goals],
  );

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  // Remounting the frame with a new key is the only reliable retry for an iframe
  // that failed to load.
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setAttempt((n) => n + 1);
    setStatus('loading');
  };
  const [open, setOpen] = useState(false);
  /** Which task the header is on. */
  const [cursor, setCursor] = useState(0);
  /** Tasks submitted correctly, in this sitting — what gates the way forward. */
  const [correctGoalIds, setCorrectGoalIds] = useState<string[]>([]);
  /** Set when a Submit found the task not done or not right; cleared on navigation. */
  const [note, setNote] = useState<'incorrect' | null>(null);
  /** Every goal the app has reported, which is "the student performed this task". */
  const [doneGoalIds, setDoneGoalIds] = useState<string[]>([]);
  const [helpMode, setHelpMode] = useState(false);
  const [height, setHeight] = useState(420);
  /**
   * The frame is rendered after mount, never in the server HTML.
   *
   * A frame in the server HTML starts loading while the client bundle is still
   * arriving, and the app announces itself the moment it has run — so its whole
   * handshake can be over before this component is hydrated and listening. Measured
   * on this page: the app posted `ready`, its first `progress` and its first `resize`
   * at 1161ms, and the first `message` listener here was attached at 1272ms. All three
   * went to nobody. `ready` is never re-sent, so the frame sat on 'loading' for good.
   *
   * The panel is only rendered once it is open, which is after mount by construction,
   * so the listener and the `load` handler always exist before the app can speak.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [popup, setPopup] = useState<{
    token: LemmatizedToken;
    position: { x: number; y: number; width?: number; height?: number };
    sentence?: string;
  } | null>(null);

  const send = useCallback((message: Record<string, unknown>) => {
    // Same-origin is not available on a sandboxed frame, so target '*'; the app
    // validates what it receives and this side validates what comes back.
    frameRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  // Tell the app about the environment.
  const sendInit = useCallback(() => {
    send({
      v: 1,
      type: 'init',
      payload: { l1: l1.code, l2: l2.code, helpMode },
    });
  }, [send, l1.code, l2.code, helpMode]);

  // The language pair can change while the frame is up, so it is announced again; on
  // mount this is a no-op, because there is no frame yet and the frame's own `load`
  // below is what greets the first document — and the document a retry mounts.
  useEffect(() => {
    sendInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l1.code, l2.code]);

  /**
   * Tokenize the app's strings via the app's OWN lemmatize pipeline.
   *
   * `enqueueLemmatize` is the same batched queue `TokenizedText` uses, so the
   * app's text shares the cache and the batch instead of issuing its own calls.
   */
  const handleTokenize = useCallback(
    async (texts: string[]) => {
      const { enqueueLemmatize } = await import('@/lib/lemmatize-queue');
      const entries = await Promise.all(
        texts.map(async (text) => {
          try {
            const tokens = await enqueueLemmatize(text, l2.code);
            return [text, tokens] as const;
          } catch (err) {
            log('[LP Web] MockApp: tokenize failed for', text, err);
            return [text, []] as const;
          }
        }),
      );
      send({
        v: 1,
        type: 'tokens',
        payload: { map: Object.fromEntries(entries) },
      });
    },
    [send, l2.code],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only accept messages from this frame.
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (!isAppToHostMessage(data)) return;
      if (!protocolCompatible(data.v)) {
        log('[LP Web] MockApp: incompatible protocol version', data.v);
        setStatus('failed');
        return;
      }

      switch (data.type) {
        case 'ready':
          setStatus('ready');
          log('[LP Web] MockApp ready:', data.payload.app, data.payload.goals.length, 'goals');
          break;
        case 'tokenize':
          void handleTokenize(data.payload.texts);
          break;
        case 'lookup': {
          const rect = data.payload.rect;
          // Frame-relative rect → host viewport, so the popup lands on the token.
          const frame = frameRef.current?.getBoundingClientRect();
          setPopup({
            token: {
              text: data.payload.text,
              lemmas: data.payload.lemma ? [{ lemma: data.payload.lemma }] : [],
            } as LemmatizedToken,
            position: {
              x: (frame?.left ?? 0) + rect.x,
              y: (frame?.top ?? 0) + rect.y,
              width: rect.width,
              height: rect.height,
            },
            sentence: data.payload.sentence,
          });
          break;
        }
        case 'progress':
          // Only ever added to. The panel unmounts its frame when it closes, so
          // reopening the app starts a fresh one that reports `done: []` — and
          // replacing the set with that empty list would take the student back to
          // task ① on a task they have already finished.
          setDoneGoalIds((ids) => [...new Set([...ids, ...data.payload.done])]);
          break;
        case 'complete': {
          // The app reports the answer; the host grades it against the linked
          // blank, so a buggy or malicious app cannot mark itself correct.
          const link = stimulus.goals.find((g) => g.id === data.payload.goalId);
          if (!link) {
            log('[LP Web] MockApp: unknown goal id', data.payload.goalId);
            break;
          }
          ctx.store.setValue(link.blankId, data.payload.answer);
          // The app sends `complete` and then `progress`. Marking the goal here
          // too means the header's own state does not depend on the second message.
          setDoneGoalIds((ids) => (ids.includes(link.id) ? ids : [...ids, link.id]));
          break;
        }
        case 'resize':
          // Capped so one pathological report cannot make the panel scroll forever; a
          // seven-row result list is ~1200px, so 900 was clipping this app and giving it
          // an inner scrollbar on top of the panel's.
          setHeight(Math.max(220, Math.min(1600, data.payload.height)));
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [ctx.store, stimulus.goals, handleTokenize]);

  const toggleHelp = () => {
    const next = !helpMode;
    setHelpMode(next);
    send({ v: 1, type: 'help-mode', payload: { on: next } });
  };

  const currentIndex = Math.min(cursor, Math.max(0, questions.length - 1));
  const current = questions[currentIndex];
  const currentCorrect = current ? correctGoalIds.includes(current.id) : false;
  const isLast = currentIndex === questions.length - 1;

  /**
   * Submit one task.
   *
   * Two authorities have to agree, and neither is sufficient alone:
   *
   * - **The app reports the task done.** Its goals are acceptance predicates over its own
   *   dataset (ADR-0045), so this is the evidence that the student actually performed the
   *   task rather than arriving at the right words some other way — and it is what makes
   *   an early Submit mean something. Without it, Submit on ① would pass before the
   *   student had tapped anything.
   * - **The content says the answer is the expected one**, via `isBlankCorrect`, which is
   *   the same comparison the final grade uses. `given` ① is always correct once the app
   *   reports it — it is a worked example and not scored.
   *
   * So submitting before the task is done reports "incorrect", which is the reachable
   * wrong path; the app ignores a tap it does not accept, so a half-picked set task is
   * simply not done yet.
   */
  const submitTask = () => {
    if (!current) return;
    const goal = stimulus.goals.find((g) => g.id === current.id);
    const blank = goal ? ctx.task.blanks?.[goal.blankId] : undefined;
    const performed = doneGoalIds.includes(current.id);
    const correct =
      Boolean(blank && goal) &&
      performed &&
      isBlankCorrect(blank!, ctx.store.getValue(goal!.blankId));

    if (!correct) {
      setNote('incorrect');
      return;
    }
    setNote(null);
    setCorrectGoalIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
    toast.success(t('review.answer_correct'));
  };

  /** The tasks still to do, from `from` forward — Next never lands on a finished one. */
  const nextIndexFrom = (from: number) =>
    questions.findIndex((goal, i) => i > from && !correctGoalIds.includes(goal.id));

  const goTo = (index: number) => {
    setNote(null);
    setCursor(index);
  };

  const nextTask = () => {
    const next = nextIndexFrom(currentIndex);
    if (next >= 0) goTo(next);
  };

  /** All Done!: grade the whole task and record the attempt, which is what marks it done. */
  const finishTask = () => {
    ctx.store.submit();
    setOpen(false);
  };

  if (status === 'failed' && !open) {
    // Never let a broken app block the exercise: fall back to the workbook
    // screenshot so the questions stay answerable.
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t('msg.app_unavailable')}</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
        >
          <RetryIcon />
          {t('action.retry')}
        </button>
        {stimulus.fallbackImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveAsset(stimulus.fallbackImage)}
            alt=""
            className="w-full rounded-lg border border-border"
          />
        )}
        {stimulus.goals.map((goal) => (
          <label key={goal.id} className="flex items-center gap-2 text-sm text-foreground">
            <span className="flex-1">{goal.prompt}</span>
            <input
              type="text"
              value={ctx.store.getValue(goal.blankId)}
              onChange={(e) => ctx.store.setValue(goal.blankId, e.target.value)}
              className="w-28 rounded border border-border bg-transparent px-2 py-1"
            />
          </label>
        ))}
      </div>
    );
  }

  const header = current && (
    <div className="flex items-start gap-2 border-b border-border pb-3">
      {wide ? (
        <DialogTitle className="flex-1 text-sm leading-relaxed font-normal">
          <TokenizedText text={current.prompt} l2Code={l2.code} />
        </DialogTitle>
      ) : (
        <SheetTitle className="flex-1 text-sm leading-relaxed font-normal">
          <TokenizedText text={current.prompt} l2Code={l2.code} />
        </SheetTitle>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {/*
          The paginator replaces the task's circled numeral: which task this is, and how
          to reach the others. Back is always available — reviewing a task you have done
          is not a mistake — while forward waits for a correct Submit, so the six are
          worked in order.
        */}
        <button
          type="button"
          onClick={() => goTo(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          aria-label={t('action.previous')}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-9 text-center text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} / {questions.length}
        </span>
        <button
          type="button"
          onClick={nextTask}
          disabled={!currentCorrect || isLast}
          aria-label={t('action.next')}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('action.close')}
          className="ml-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );

  const app = (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card">
      {status === 'loading' && (
        <p className="p-4 text-sm text-muted-foreground">{t('msg.loading')}</p>
      )}
      {status === 'failed' ? (
        <div className="flex flex-col items-start gap-2 p-4">
          <p className="text-xs text-muted-foreground">{t('msg.app_unavailable')}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            <RetryIcon />
            {t('action.retry')}
          </button>
        </div>
      ) : (
        mounted && (
          <iframe
            // Remounting with a new key is the only reliable retry for a frame
            // that failed to load.
            key={attempt}
            ref={frameRef}
            title={stimulus.app}
            src={mockAppHref(MOCK_APP_BASE_URL, stimulus.app)}
            // No allow-same-origin: the app must not reach host storage or the DOM.
            sandbox="allow-scripts"
            onLoad={() => {
              // The frame has a document now, which is the first moment it can
              // hear anything — and the moment a retry's new document needs its
              // own `init`. `init` is idempotent.
              sendInit();
              // A frame that loads but never says 'ready' is broken; give it a beat.
              window.setTimeout(() => {
                setStatus((s) => (s === 'loading' ? 'failed' : s));
              }, 4000);
            }}
            onError={() => setStatus('failed')}
            style={{ height, width: '100%', border: 0 }}
          />
        )
      )}
    </div>
  );

  /**
   * The toolbar, and the only control that resolves anything.
   *
   * Help mode is icon-only: it is a toggle whose state is visible in the app itself
   * (words become tappable), so the label was noise next to the two controls it shares
   * the row with. It keeps its accessible name.
   */
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={toggleHelp}
        aria-pressed={helpMode}
        aria-label={t('label.enable_popup_dictionary')}
        title={t('label.enable_popup_dictionary')}
        className={`inline-flex items-center rounded-md border p-2 transition-colors ${
          helpMode
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-foreground hover:bg-muted'
        }`}
      >
        <Languages className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => send({ v: 1, type: 'hint' })}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
      >
        <Lightbulb className="h-3.5 w-3.5" aria-hidden />
        {t('action.hint')}
      </button>

      {/* A wrong Submit is acknowledged without a toast: the button stays Submit, and the
          student is told to keep working on this one. */}
      {note === 'incorrect' && (
        <span role="status" className="text-xs text-muted-foreground">
          {t('review.answer_incorrect')}
        </span>
      )}

      <div className="ml-auto">
        {currentCorrect && !isLast ? (
          <button
            type="button"
            onClick={nextTask}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
          >
            {t('action.next')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : currentCorrect && isLast ? (
          <button
            type="button"
            onClick={finishTask}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <PartyPopper className="h-4 w-4" aria-hidden />
            {t('msg.all_done')}
          </button>
        ) : (
          <button
            type="button"
            onClick={submitTask}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('review.submit')}
          </button>
        )}
      </div>
    </div>
  );

  const panel = (
    <>
      {header}
      {app}
      {toolbar}
    </>
  );

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <ExternalLink className="h-5 w-5" aria-hidden />
        {t('action.launch_mini_app')}
      </button>

      {wide ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            className="flex max-h-[85vh] min-h-0 w-[min(32rem,92vw)] max-w-none flex-col gap-3 p-4"
          >
            {panel}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="flex max-h-[88vh] min-h-0 flex-col gap-3 rounded-t-2xl p-4"
          >
            {panel}
          </SheetContent>
        </Sheet>
      )}

      {popup && (
        <DictionaryPopup
          token={popup.token}
          l1Code={l1.code}
          l2Code={l2.code}
          position={popup.position}
          // `form` is the surface the word was tapped in; `text` is the L2
          // sentence it sat in, which is what a saved word should carry.
          context={
            popup.sentence
              ? { text: popup.sentence, form: popup.token.text }
              : undefined
          }
          onClose={() => setPopup(null)}
        />
      )}
    </section>
  );
}
