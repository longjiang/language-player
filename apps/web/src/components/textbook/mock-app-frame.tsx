'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAssetResolver,
  indexToCircled,
  isAppToHostMessage,
  mockAppHref,
  protocolCompatible,
  type MockAppStimulus,
} from '@langplayer/textbooks';
import { Check } from 'lucide-react';
import { ASSET_BASE_URL, MOCK_APP_BASE_URL } from '@/lib/asset-url';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { RetryIcon } from './retry-icon';
import { log } from '@/lib/logger';
import { DictionaryPopup } from '@/components/dictionary-popup';
import type { LemmatizedToken } from '@langplayer/shared';
import { useTextbookTask } from './task-provider';
import { TokenizedText } from '@/components/tokenized-text';

/**
 * Host frame for a self-contained mock app (SPEC-095, ADR-0045).
 *
 * The host deliberately knows nothing about the app's UI. It owns the frame, the
 * bridge, and the three shared affordances — help mode, hint, and grading the
 * answers the app reports — so adding a mock app adds no host code.
 *
 * Sandboxed WITHOUT `allow-same-origin`: the app runs on an opaque origin, and
 * `postMessage` is the only channel. That is why tokens are pushed in rather than
 * fetched by the app.
 */
export function MockAppFrame({ stimulus }: { stimulus: MockAppStimulus }) {
  const ctx = useTextbookTask()!;
  const { l1, l2 } = useLanguage();
  const t = useT();
  const resolveAsset = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  /** The goals that print a question, in the app's own order. */
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
  const [goalCount, setGoalCount] = useState(stimulus.goals.length);
  const [doneGoalIds, setDoneGoalIds] = useState<string[]>([]);
  const [helpMode, setHelpMode] = useState(false);
  const [height, setHeight] = useState(420);
  const [loaded, setLoaded] = useState(false);
  /**
   * The frame is rendered after mount, never in the server HTML.
   *
   * A frame in the server HTML starts loading while the client bundle is still
   * arriving, and the app announces itself the moment it has run — so its whole
   * handshake can be over before this component is hydrated and listening.
   * Measured on this page: the app posted `ready`, its first `progress` and its
   * first `resize` at 1161ms, and the first `message` listener here was attached
   * at 1272ms. All three went to nobody. `ready` is never re-sent, so the frame
   * sat on 'loading' for good, while clicks still worked (a later `progress`
   * arrived) — an app that looked alive and reported 1 / 6 with nothing asked.
   *
   * Rendering it here puts its first byte after this component's effects, so the
   * listener and the `load` handler both exist before the app can speak. The
   * `load` handler matters too: attached during hydration it missed a `load` that
   * had already fired, so the 4s grace timer never started and a frame that never
   * said `ready` never degraded to the fallback either.
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

  // Tell the app about the environment as soon as it is ready.
  const sendInit = useCallback(() => {
    send({
      v: 1,
      type: 'init',
      payload: { l1: l1.code, l2: l2.code, helpMode },
    });
  }, [send, l1.code, l2.code, helpMode]);

  // `init` can only be delivered to a frame that exists, so it goes out when the
  // frame loads rather than on this component's mount — and again if the language
  // pair changes while the frame is up.
  useEffect(() => {
    if (loaded) sendInit();
  }, [loaded, sendInit]);

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
          setGoalCount(data.payload.goals.length);
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
          setDoneGoalIds(data.payload.done);
          setGoalCount(data.payload.total);
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
          // too means the question's own marker does not depend on the second
          // message arriving — the same message the handshake race used to eat.
          setDoneGoalIds((ids) => (ids.includes(link.id) ? ids : [...ids, link.id]));
          break;
        }
        case 'resize':
          setHeight(Math.max(220, Math.min(900, data.payload.height)));
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

  const answered = doneGoalIds.length;

  if (status === 'failed') {
    // Never let a broken frame block the exercise: fall back to the workbook
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

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleHelp}
          aria-pressed={helpMode}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            helpMode
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-foreground hover:bg-muted'
          }`}
        >
          {t('label.enable_popup_dictionary')}
        </button>
        <button
          type="button"
          onClick={() => send({ v: 1, type: 'hint' })}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          {t('action.hint')}
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {answered} / {goalCount}
        </span>
      </div>

      {/*
        The questions are the host's, not the app's. The app renders a 12306
        screen and nothing else, so a student who only ever saw the frame had the
        screen, a `1 / 6` counter and no idea what the six questions were. They
        come from the content, which is also what each reported goal is graded
        against, so the printed question and the graded answer cannot drift.

        An answered one is struck out, which is this feature's existing mark for
        "you have placed this" (see the option pools). A `goal` with no `prompt`
        has nothing to print, but still counts in the counter and is still graded.
      */}
      {questions.length > 0 && (
        <ol className="flex flex-col gap-1.5 text-sm text-foreground">
          {questions.map((goal, index) => {
            const done = doneGoalIds.includes(goal.id);
            return (
              <li key={goal.id} className="flex items-start gap-2">
                <span className="text-muted-foreground">{indexToCircled(index + 1)}</span>
                <span className={done ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
                  <TokenizedText text={goal.prompt} l2Code={l2.code} />
                </span>
                {done && <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />}
              </li>
            );
          })}
        </ol>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {status === 'loading' && (
          <p className="p-4 text-sm text-muted-foreground">{t('msg.loading')}</p>
        )}
        {mounted && (
          <iframe
            // Remounting with a new key is the only reliable retry for a frame
            // that failed to load — without this the retry button was a no-op on
            // web, which is what SPEC-095's Error state promises it is not.
            key={attempt}
            ref={frameRef}
            title={stimulus.app}
            src={mockAppHref(MOCK_APP_BASE_URL, stimulus.app)}
            // No allow-same-origin: the app must not reach host storage or the DOM.
            sandbox="allow-scripts"
            onLoad={() => {
              setLoaded(true);
              // A frame that loads but never says 'ready' is broken; give it a beat.
              window.setTimeout(() => {
                setStatus((s) => (s === 'loading' ? 'failed' : s));
              }, 4000);
            }}
            onError={() => setStatus('failed')}
            style={{ height, width: '100%', border: 0 }}
          />
        )}
      </div>

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
