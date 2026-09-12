import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Check, ExternalLink, Languages, Lightbulb, PartyPopper, X } from 'lucide-react-native';
import {
  createAssetResolver,
  indexToCircled,
  isAppToHostMessage,
  mockAppHref,
  protocolCompatible,
  type MockAppStimulus,
} from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { MOCK_APP_BASE_URL } from '@/lib/mock-app-url';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { log } from '@/lib/logger';
import { ICON_MUTED, ICON_ON_PRIMARY, ICON_PRIMARY } from '@/lib/theme-colors';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';
import { TokenizedText } from '@/components/TokenizedText';
import * as Dialog from '@/components/ui/dialog';
import { useTextbookTask } from './task-provider';

/**
 * Host for a self-contained mock app (SPEC-095, ADR-0045).
 *
 * The mobile counterpart of the web frame, and the same shape: the page carries a
 * launch button, the app opens in a panel over it — a bottom sheet below 768, a
 * centered dialog at or above (SPEC-052's policy, ADR-0042's container), and the host
 * asks one task at a time in the header with Next / All Done!.
 *
 * The bridge LOGIC is identical to web — same message set, same validation, same
 * grading — but the transport is not: RN's WebView delivers messages as a string on
 * `onMessage` and receives them through `injectJavaScript`, where web uses structured
 * `postMessage` both ways. That difference is contained to `send` and `onMessage`.
 */
export function MockAppFrame({ stimulus }: { stimulus: MockAppStimulus }) {
  const ctx = useTextbookTask()!;
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { isMd } = useResponsive();
  const resolveAsset = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  /** The goals that print a task, in the app's own order. */
  const questions = useMemo(
    () => stimulus.goals.flatMap((goal) => (goal.prompt ? [{ id: goal.id, prompt: goal.prompt }] : [])),
    [stimulus.goals],
  );

  const webRef = useRef<WebView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setAttempt((n) => n + 1);
    setStatus('loading');
  };
  const [open, setOpen] = useState(false);
  /** Which task the header is on. It does not advance by itself: Next does that. */
  const [cursor, setCursor] = useState(0);
  const [doneGoalIds, setDoneGoalIds] = useState<string[]>([]);
  const [helpMode, setHelpMode] = useState(false);
  const [popup, setPopup] = useState<{
    word: string;
    lemma?: string;
    context?: string;
  } | null>(null);

  /** Deliver a host message to the app: RN has no postMessage, so inject a call. */
  const send = useCallback((message: Record<string, unknown>) => {
    const json = JSON.stringify(message);
    webRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: ${json} })); true;`,
    );
  }, []);

  const sendInit = useCallback(() => {
    send({
      v: 1,
      type: 'init',
      payload: { l1: l1Lang.code, l2: l2Lang.code, helpMode },
    });
  }, [send, l1Lang.code, l2Lang.code, helpMode]);

  useEffect(() => {
    sendInit();
    // Only on mount / language change; help mode has its own message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l1Lang.code, l2Lang.code]);

  /**
   * Tokenize the app's strings with this app's own lemmatizer, which has an
   * offline fallback chain — so help mode still works without the server here,
   * unlike web.
   */
  const handleTokenize = useCallback(
    async (texts: string[]) => {
      const { lemmatizeText } = await import('@/lib/tokenizer');
      const entries = await Promise.all(
        texts.map(async (text) => {
          try {
            const tokens = await lemmatizeText(text, l2Lang.code);
            return [text, tokens] as const;
          } catch (err) {
            log('[LP Mobile] MockApp: tokenize failed for', text, err);
            return [text, []] as const;
          }
        }),
      );
      send({ v: 1, type: 'tokens', payload: { map: Object.fromEntries(entries) } });
    },
    [send, l2Lang.code],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return; // Not our protocol.
      }
      if (!isAppToHostMessage(data)) return;
      if (!protocolCompatible(data.v)) {
        log('[LP Mobile] MockApp: incompatible protocol version', data.v);
        setStatus('failed');
        return;
      }

      switch (data.type) {
        case 'ready':
          setStatus('ready');
          break;
        case 'tokenize':
          void handleTokenize(data.payload.texts);
          break;
        case 'lookup':
          setPopup({
            word: data.payload.text,
            lemma: data.payload.lemma,
            context: data.payload.sentence,
          });
          break;
        case 'progress':
          // Only ever added to. Closing the panel unmounts its WebView, so reopening
          // starts a fresh app that reports `done: []` — and replacing the set with
          // that empty list would take the student back to task ① on a task they have
          // already finished.
          setDoneGoalIds((ids) => [...new Set([...ids, ...data.payload.done])]);
          break;
        case 'complete': {
          // The host grades, not the app: a buggy app cannot mark itself correct.
          const link = stimulus.goals.find((g) => g.id === data.payload.goalId);
          if (!link) {
            log('[LP Mobile] MockApp: unknown goal id', data.payload.goalId);
            break;
          }
          ctx.store.setValue(link.blankId, data.payload.answer);
          // The app sends `complete` and then `progress`. Marking the goal here
          // too means the question's own marker does not depend on the second
          // message arriving.
          setDoneGoalIds((ids) => (ids.includes(link.id) ? ids : [...ids, link.id]));
          break;
        }
        case 'resize':
          // Deliberately unused here: the panel is a fixed-height sheet or dialog and
          // the WebView fills it, so the app's own scrolling handles content taller
          // than the panel. Web sizes its iframe to this height instead, because its
          // panel scrolls around the frame rather than inside it.
          break;
        default:
          break;
      }
    },
    [ctx.store, stimulus.goals, handleTokenize],
  );

  const toggleHelp = () => {
    const next = !helpMode;
    setHelpMode(next);
    send({ v: 1, type: 'help-mode', payload: { on: next } });
  };

  const currentIndex = Math.min(cursor, Math.max(0, questions.length - 1));
  const current = questions[currentIndex];
  const allDone = questions.length > 0 && questions.every((goal) => doneGoalIds.includes(goal.id));
  const currentDone = current ? doneGoalIds.includes(current.id) : false;

  /** Next: the next task still unanswered, so it never lands on a finished one. */
  const advance = () => {
    const next = questions.findIndex((goal, i) => i > currentIndex && !doneGoalIds.includes(goal.id));
    if (next >= 0) setCursor(next);
  };

  if (status === 'failed' && !open) {
    // Never let a broken app block the exercise: fall back to the workbook
    // screenshot so the questions stay answerable.
    return (
      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">{t('msg.app_unavailable')}</Text>
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          className="self-start rounded-md border border-border bg-background px-2.5 py-1.5"
        >
          <Text className="text-xs text-foreground">{t('action.retry')}</Text>
        </Pressable>
        {stimulus.fallbackImage && (
          <Image
            source={{ uri: resolveAsset(stimulus.fallbackImage) }}
            resizeMode="contain"
            style={{ width: '100%', aspectRatio: 3 / 4 }}
            className="rounded-lg border border-border"
          />
        )}
        {stimulus.goals.map((goal) => (
          <View key={goal.id} className="flex-row items-center gap-2">
            <Text className="flex-1 text-sm text-foreground">{goal.prompt}</Text>
            <TextInput
              value={ctx.store.getValue(goal.blankId)}
              onChangeText={(v) => ctx.store.setValue(goal.blankId, v)}
              autoCapitalize="characters"
              autoCorrect={false}
              className="w-28 rounded border border-border px-2 py-1 text-foreground"
            />
          </View>
        ))}
      </View>
    );
  }

  /**
   * The task being asked, one at a time.
   *
   * The app renders a train list and no questions, so six tasks in one app is only
   * followable if the student is told which one they are on. The prompts come from the
   * content, which is also what each reported goal is graded against.
   */
  const header = current && (
    <View className="flex-row items-start gap-2 border-b border-border pb-3">
      <Text className="pt-0.5 text-sm text-muted-foreground">{indexToCircled(currentIndex + 1)}</Text>
      <View className={currentDone && !allDone ? 'flex-1 opacity-50' : 'flex-1'}>
        {/*
          Dimmed rather than struck through: `TokenizedText`'s memo comparator is a
          hand-written allow-list (SPEC-095, The Mobile Re-render Boundary), so a
          text-style prop added for a cosmetic mark would have to be threaded through
          it — and a prop left out of it renders stale values in silence.
        */}
        <Dialog.Title className="text-sm font-normal leading-relaxed text-foreground">
          <TokenizedText text={current.prompt} l2Code={l2Lang.code} />
        </Dialog.Title>
      </View>
      <View className="flex-row shrink-0 items-center gap-1.5">
        {allDone ? (
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-md bg-primary px-3 py-1.5"
          >
            <PartyPopper size={14} color={ICON_ON_PRIMARY} />
            <Text className="text-xs font-medium text-primary-foreground">{t('msg.all_done')}</Text>
          </Pressable>
        ) : currentDone ? (
          <Pressable
            onPress={advance}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-md border border-primary px-3 py-1.5"
          >
            <Check size={14} color={ICON_PRIMARY} />
            <Text className="text-xs font-medium text-primary">{t('action.next')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('action.close')}
          className="rounded-md p-1.5"
        >
          <X size={16} color={ICON_MUTED} />
        </Pressable>
      </View>
    </View>
  );

  const appPane = (
    <View className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
      {status === 'failed' ? (
        // The panel keeps the failure visible where the app was, so the student is not
        // left wondering why the screen went blank; closing it reveals the workbook
        // fallback behind, which is what keeps the task answerable.
        <View className="items-start gap-2 p-4">
          <Text className="text-xs text-muted-foreground">{t('msg.app_unavailable')}</Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 self-start rounded-md border border-border bg-background px-2.5 py-1.5"
          >
            <Text className="text-xs text-foreground">{t('action.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {status === 'loading' && (
            <View className="absolute inset-0 z-10 items-center justify-center">
              <ActivityIndicator />
              <Text className="mt-2 text-sm text-muted-foreground">{t('msg.loading')}</Text>
            </View>
          )}
          <WebView
            // Remounting with a new key is how a failed WebView is retried.
            key={`${stimulus.app}:${attempt}`}
            ref={webRef}
            source={{ uri: mockAppHref(MOCK_APP_BASE_URL, stimulus.app) }}
            originWhitelist={['*']}
            javaScriptEnabled
            // The bridge is the only channel; no native file access.
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            onMessage={onMessage}
            onError={() => setStatus('failed')}
            onHttpError={() => setStatus('failed')}
            onLoadEnd={() => {
              // `init` is delivered by injecting script, which needs a live document:
              // the mount-time send races this WebView coming up, so re-announce on
              // load, as web does. `init` is idempotent.
              sendInit();
              // A frame that loads but never says 'ready' is broken; give it a beat
              // rather than leaving the student on a spinner.
              setTimeout(() => {
                setStatus((s) => (s === 'loading' ? 'failed' : s));
              }, 4000);
            }}
            style={{ flex: 1 }}
          />
        </>
      )}
    </View>
  );

  /** Help mode and hint act on the app, so they live with it rather than behind it. */
  const toolbar = (
    <View className="flex-row flex-wrap items-center gap-2 border-t border-border pt-3">
      <Pressable
        onPress={toggleHelp}
        accessibilityRole="button"
        accessibilityState={{ selected: helpMode }}
        className={`flex-row items-center gap-1.5 rounded-md border px-3 py-1.5 ${
          helpMode ? 'border-primary bg-primary/10' : 'border-border'
        }`}
      >
        <Languages size={14} color={helpMode ? ICON_PRIMARY : ICON_MUTED} />
        <Text className={`text-xs ${helpMode ? 'text-primary' : 'text-foreground'}`}>
          {t('label.enable_popup_dictionary')}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => send({ v: 1, type: 'hint' })}
        accessibilityRole="button"
        className="flex-row items-center gap-1.5 rounded-md border border-border px-3 py-1.5"
      >
        <Lightbulb size={14} color={ICON_MUTED} />
        <Text className="text-xs text-foreground">{t('action.hint')}</Text>
      </Pressable>
    </View>
  );

  /** The app itself is only mounted here, so it cannot load before the host listens. */
  const panel = (
    <View className="flex-1 gap-3">
      {header}
      {appPane}
      {toolbar}
    </View>
  );

  return (
    <View className="gap-2">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        className="flex-row items-center gap-2 self-start rounded-lg bg-primary px-5 py-3"
      >
        <ExternalLink size={20} color={ICON_ON_PRIMARY} />
        <Text className="text-base font-medium text-primary-foreground">
          {t('action.launch_mini_app')}
        </Text>
      </Pressable>

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <Dialog.Portal>
          {isMd ? (
            <Dialog.Content
              containerClassName="px-4"
              className="h-[85%] w-full max-w-2xl gap-0 rounded-xl border border-border bg-background p-4"
            >
              <View className="flex-1">{panel}</View>
            </Dialog.Content>
          ) : (
            <Dialog.SheetContent className="h-[85%]">
              <View className="flex-1">{panel}</View>
            </Dialog.SheetContent>
          )}
        </Dialog.Portal>
      </Dialog.Root>

      {popup && (
        <DictionaryPopup
          visible
          word={popup.word}
          lemma={popup.lemma}
          context={popup.context}
          onClose={() => setPopup(null)}
        />
      )}
    </View>
  );
}
