import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  createAssetResolver,
  isAppToHostMessage,
  mockAppHref,
  protocolCompatible,
  type MockAppStimulus,
} from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { MOCK_APP_BASE_URL } from '@/lib/mock-app-url';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';
import { useTextbookTask } from './task-provider';

/**
 * Host frame for a self-contained mock app (SPEC-095, ADR-0045).
 *
 * The mobile counterpart of the web frame. The bridge LOGIC is identical — same
 * message set, same validation, same grading — but the transport is not: RN's
 * WebView delivers messages as a string on `onMessage` and receives them through
 * `injectJavaScript`, where the web frame uses structured `postMessage` both
 * ways. That difference is contained to `send` and `onMessage` here.
 */
export function MockAppFrame({ stimulus }: { stimulus: MockAppStimulus }) {
  const ctx = useTextbookTask()!;
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const resolveAsset = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);

  const webRef = useRef<WebView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [goalCount, setGoalCount] = useState(stimulus.goals.length);
  const [doneGoalIds, setDoneGoalIds] = useState<string[]>([]);
  const [helpMode, setHelpMode] = useState(false);
  const [height, setHeight] = useState(440);
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

  useEffect(() => {
    send({
      v: 1,
      type: 'init',
      payload: { l1: l1Lang.code, l2: l2Lang.code, helpMode },
    });
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
          setGoalCount(data.payload.goals.length);
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
          setDoneGoalIds(data.payload.done);
          setGoalCount(data.payload.total);
          break;
        case 'complete': {
          // The host grades, not the app: a buggy app cannot mark itself correct.
          const link = stimulus.goals.find((g) => g.id === data.payload.goalId);
          if (!link) {
            log('[LP Mobile] MockApp: unknown goal id', data.payload.goalId);
            break;
          }
          ctx.store.setValue(link.blankId, data.payload.answer);
          break;
        }
        case 'resize':
          setHeight(Math.max(240, Math.min(900, data.payload.height)));
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

  if (status === 'failed') {
    // Never let a broken frame block the exercise: fall back to the workbook
    // screenshot so the questions stay answerable.
    return (
      <View className="gap-2">
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

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Pressable
          onPress={toggleHelp}
          accessibilityRole="button"
          accessibilityState={{ selected: helpMode }}
          className={`rounded-md border px-3 py-1.5 ${
            helpMode ? 'border-primary bg-primary/10' : 'border-border'
          }`}
        >
          <Text className={`text-sm ${helpMode ? 'text-primary' : 'text-foreground'}`}>
            {t('label.enable_popup_dictionary')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => send({ v: 1, type: 'hint' })}
          accessibilityRole="button"
          className="rounded-md border border-border px-3 py-1.5"
        >
          <Text className="text-sm text-foreground">{t('action.hint')}</Text>
        </Pressable>
        <Text className="ml-auto text-xs text-muted-foreground">
          {doneGoalIds.length} / {goalCount}
        </Text>
      </View>

      <View className="overflow-hidden rounded-lg border border-border bg-card" style={{ height }}>
        {status === 'loading' && (
          <View className="absolute inset-0 z-10 items-center justify-center">
            <ActivityIndicator />
            <Text className="mt-2 text-sm text-muted-foreground">{t('msg.loading')}</Text>
          </View>
        )}
        <WebView
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
            // A frame that loads but never says 'ready' is broken; give it a beat
            // rather than leaving the student on a spinner.
            setTimeout(() => {
              setStatus((s) => (s === 'loading' ? 'failed' : s));
            }, 4000);
          }}
          style={{ flex: 1 }}
        />
      </View>

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
