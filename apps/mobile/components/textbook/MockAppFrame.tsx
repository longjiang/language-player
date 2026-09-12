import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Languages,
  Lightbulb,
  PartyPopper,
  X,
} from 'lucide-react-native';
import {
  createAssetResolver,
  isAppToHostMessage,
  isBlankCorrect,
  mockAppHref,
  PICK_SEPARATOR,
  pickValues,
  protocolCompatible,
  type BlankSpec,
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
  /** Which task the header is on. */
  const [cursor, setCursor] = useState(0);
  /** Tasks submitted correctly, in this sitting — what gates the way forward. */
  const [correctGoalIds, setCorrectGoalIds] = useState<string[]>([]);
  /** Set when a Submit found the task not done or not right; cleared on navigation. */
  const [note, setNote] = useState<'incorrect' | null>(null);
  /** The transient "Correct" acknowledgement — RN has no toast, so it is a pill. */
  const [flash, setFlash] = useState(false);
  /** What the app has selected for each task, as it is toggled. The blank follows it. */
  const [selections, setSelections] = useState<Record<string, string[]>>({});
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
        case 'selection': {
          // The app reports what is *selected*; the host grades it. Writing the blank here
          // is what makes the store the one answer: Submit, the final grade and the restore
          // on the next visit all read it.
          const link = stimulus.goals.find((g) => g.id === data.payload.goalId);
          if (!link) {
            log('[LP Mobile] MockApp: unknown goal id', data.payload.goalId);
            break;
          }
          setSelections((byGoal) => ({ ...byGoal, [link.id]: data.payload.picks }));
          ctx.store.setValue(link.blankId, data.payload.picks.join(PICK_SEPARATOR));
          break;
        }
        case 'progress':
          // The app's own view of which goals its selections satisfy (ADR-0045 §3). The
          // panel grades from the store instead, so this is accepted and not acted on.
          break;
        case 'complete': {
          // Kept for an app that reports a goal without a selection model — it writes the
          // same blank a selection would.
          const link = stimulus.goals.find((g) => g.id === data.payload.goalId);
          if (!link) {
            log('[LP Mobile] MockApp: unknown goal id', data.payload.goalId);
            break;
          }
          ctx.store.setValue(link.blankId, data.payload.answer);
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
  const currentCorrect = current ? correctGoalIds.includes(current.id) : false;
  const isLast = currentIndex === questions.length - 1;

  const blankIdFor = (goalId: string | undefined) =>
    stimulus.goals.find((g) => g.id === goalId)?.blankId;

  /**
   * Whether what the student selected for this task is the expected answer.
   *
   * `isBlankCorrect` answers "does this count toward the score", and a `given` worked example
   * always does: it is pre-filled and excluded from scoring. That is the wrong question for a
   * step the student has to perform — ①'s answer is printed nowhere they can see, so every
   * selection would pass and a student who ticked the wrong train would be congratulated.
   * Relabelled for this comparison only; the answer key and the set rule stay the blank's own.
   */
  const selectionIsRight = (blank: BlankSpec, picks: string[]) =>
    isBlankCorrect(
      blank.kind === 'given' ? { ...blank, kind: 'goal' } : blank,
      picks.join(PICK_SEPARATOR),
    );

  /**
   * Submit one task.
   *
   * The student's **selection is the answer**, and the content grades it — the same
   * comparison the final grade uses. So a task can be submitted wrong, which is the point:
   * an empty selection, a single train where the task asks for all of them, or a train the
   * task does not name all read as incorrect.
   *
   * Submitting nothing is refused by its own rule: `given` is *always* correct by
   * definition, so the blank cannot say whether the student did anything — the selection can.
   */
  const submitTask = () => {
    if (!current) return;
    const goal = stimulus.goals.find((g) => g.id === current.id);
    const blank = goal ? ctx.task.blanks?.[goal.blankId] : undefined;
    const picks = selections[current.id] ?? [];
    const correct =
      Boolean(blank && goal) && picks.length > 0 && selectionIsRight(blank!, picks);

    if (!correct) {
      setNote('incorrect');
      return;
    }
    setNote(null);
    setCorrectGoalIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  };

  /** The tasks still to do, from `from` forward — Next never lands on a finished one. */
  const nextIndexFrom = (from: number) =>
    questions.findIndex((goal, i) => i > from && !correctGoalIds.includes(goal.id));

  const goTo = (index: number) => {
    setNote(null);
    setCursor(index);
  };

  /**
   * Keep the app on the task the panel is showing, and holding that task's selection.
   *
   * The app cannot know either on its own — the tasks live in the content and the answers in
   * the store — so every move is announced. A task the student has already answered comes
   * back with its picks; one they have not reached arrives empty, which is what stops a
   * selection following them from task to task. A `given` worked example is excluded: its
   * answer is pre-filled for the final grade, not selected by the student.
   */
  const sendFocus = useCallback(
    (goalId: string | undefined, blankId: string | undefined) => {
      if (!goalId || !blankId) return;
      const blank = ctx.task.blanks?.[blankId];
      const picks = blank && blank.kind !== 'given' ? pickValues(ctx.store.getValue(blankId)) : [];
      send({ v: 1, type: 'focus', payload: { goalId, picks } });
    },
    [send, ctx.store, ctx.task],
  );

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
  /**
   * The top bar is the close affordance and nothing else.
   *
   * The task and its paginator moved down to the bar that resolves it: reading what is
   * asked, moving between tasks and submitting are one activity, and they were split across
   * the panel's two ends. No rule under it either — it separates nothing now.
   */
  const topBar = (
    <View className="flex-row justify-end">
      <Pressable
        onPress={() => setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel={t('action.close')}
        className="rounded-md p-1.5"
      >
        <X size={16} color={ICON_MUTED} />
      </Pressable>
    </View>
  );

  const title = current ? (
    <View className="flex-1">
      <Dialog.Title className="text-sm font-normal leading-relaxed text-foreground">
        <TokenizedText text={current.prompt} l2Code={l2Lang.code} />
      </Dialog.Title>
    </View>
  ) : null;

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
              // load, as web does. `init` is idempotent, and so is `focus`.
              sendInit();
              sendFocus(current?.id, currentBlankId);
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

  /**
   * Help mode and hint act on the app, so they live with it rather than behind it — and so
   * does the only control that resolves anything.
   *
   * Help mode is icon-only: it is a toggle whose state is visible in the app itself (words
   * become tappable), so the label was noise next to the two controls it shares the row
   * with. It keeps its accessible name.
   */
  const bottomBar = (
    <View className="gap-2 border-t border-border pt-3">
      {current && (
        <View className="flex-row items-start gap-2">
          {title}
          {/*
            The paginator replaces the task's circled numeral: which task this is, and how to
            reach the others. Back is always available — reviewing a task you have done is not
            a mistake — while forward waits for a correct Submit, so the six are worked in
            order.
          */}
          <View className="flex-row shrink-0 items-center gap-1">
            <Pressable
              onPress={() => goTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              accessibilityRole="button"
              accessibilityLabel={t('action.previous')}
              className={`rounded-md p-1 ${currentIndex === 0 ? 'opacity-40' : ''}`}
            >
              <ChevronLeft size={18} color={ICON_MUTED} />
            </Pressable>
            <Text className="min-w-9 text-center text-xs text-muted-foreground">
              {currentIndex + 1} / {questions.length}
            </Text>
            <Pressable
              onPress={nextTask}
              disabled={!currentCorrect || isLast}
              accessibilityRole="button"
              accessibilityLabel={t('action.next')}
              className={`rounded-md p-1 ${!currentCorrect || isLast ? 'opacity-40' : ''}`}
            >
              <ChevronRight size={18} color={ICON_MUTED} />
            </Pressable>
          </View>
        </View>
      )}

      <View className="flex-row flex-wrap items-center gap-2">
      <Pressable
        onPress={toggleHelp}
        accessibilityRole="button"
        accessibilityState={{ selected: helpMode }}
        accessibilityLabel={t('label.enable_popup_dictionary')}
        className={`items-center rounded-md border p-2 ${
          helpMode ? 'border-primary bg-primary/10' : 'border-border'
        }`}
      >
        <Languages size={16} color={helpMode ? ICON_PRIMARY : ICON_MUTED} />
      </Pressable>
      <Pressable
        onPress={() => send({ v: 1, type: 'hint' })}
        accessibilityRole="button"
        className="flex-row items-center gap-1.5 rounded-md border border-border px-3 py-1.5"
      >
        <Lightbulb size={14} color={ICON_MUTED} />
        <Text className="text-xs text-foreground">{t('action.hint')}</Text>
      </Pressable>

      {/* A wrong Submit is acknowledged without a toast: the button stays Submit, and the
          student is told to keep working on this one. */}
      {note === 'incorrect' && (
        <Text accessibilityRole="alert" className="text-xs text-muted-foreground">
          {t('review.answer_incorrect')}
        </Text>
      )}

      <View className="ml-auto">
        {currentCorrect && !isLast ? (
          <Pressable
            onPress={nextTask}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-md border border-primary px-4 py-1.5"
          >
            <Text className="text-sm font-medium text-primary">{t('action.next')}</Text>
            <ChevronRight size={16} color={ICON_PRIMARY} />
          </Pressable>
        ) : currentCorrect && isLast ? (
          <Pressable
            onPress={finishTask}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-md bg-primary px-4 py-1.5"
          >
            <PartyPopper size={16} color={ICON_ON_PRIMARY} />
            <Text className="text-sm font-medium text-primary-foreground">{t('msg.all_done')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={submitTask}
            accessibilityRole="button"
            className="rounded-md bg-primary px-4 py-1.5"
          >
            <Text className="text-sm font-medium text-primary-foreground">{t('review.submit')}</Text>
          </Pressable>
        )}
      </View>
      </View>
    </View>
  );

  /** The app itself is only mounted here, so it cannot load before the host listens. */
  const currentBlankId = blankIdFor(current?.id);
  useEffect(() => {
    if (open) sendFocus(current?.id, currentBlankId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id, currentBlankId]);

  const panel = (
    <View className="flex-1 gap-3">
      {/* RN has no toast stack, so the "Correct" acknowledgement is a pill over the panel
          rather than web's `toast.success` — the same shape `SettingsDialog` uses. */}
      {flash && (
        <View className="absolute top-1 right-1 z-50 rounded-full bg-primary/90 px-3 py-1.5">
          <Text className="text-xs font-medium text-primary-foreground">
            ✓ {t('review.answer_correct')}
          </Text>
        </View>
      )}
      {topBar}
      {appPane}
      {bottomBar}
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
