'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAssetResolver,
  isAppToHostMessage,
  mockAppHref,
  protocolCompatible,
  type MockAppStimulus,
} from '@langplayer/textbooks';
import { ASSET_BASE_URL, MOCK_APP_BASE_URL } from '@/lib/asset-url';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { DictionaryPopup } from '@/components/dictionary-popup';
import type { LemmatizedToken } from '@langplayer/shared';
import { useTextbookTask } from './task-provider';

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

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [goalCount, setGoalCount] = useState(stimulus.goals.length);
  const [doneGoalIds, setDoneGoalIds] = useState<string[]>([]);
  const [helpMode, setHelpMode] = useState(false);
  const [height, setHeight] = useState(420);
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

  useEffect(() => {
    sendInit();
    // Only on mount / when the language pair changes — help mode has its own message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendInit]);

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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {status === 'loading' && (
          <p className="p-4 text-sm text-muted-foreground">{t('msg.loading')}</p>
        )}
        <iframe
          ref={frameRef}
          title={stimulus.app}
          src={mockAppHref(MOCK_APP_BASE_URL, stimulus.app)}
          // No allow-same-origin: the app must not reach host storage or the DOM.
          sandbox="allow-scripts"
          onLoad={() => {
            // A frame that loads but never says 'ready' is broken; give it a beat.
            window.setTimeout(() => {
              setStatus((s) => (s === 'loading' ? 'failed' : s));
            }, 4000);
          }}
          onError={() => setStatus('failed')}
          style={{ height, width: '100%', border: 0 }}
        />
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
