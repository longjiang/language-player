import React, { useState, useCallback } from 'react';
import {
  View, Text, Modal, ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Pressable } from '@/components/ui/pressable';
import { Button } from '@/components/ui/button';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useSpeech } from '@/hooks/use-speech';
import { PYTHON_API_URL } from '@/lib/api-url';
import { renderInlineMarkdown } from '@/lib/inline-markdown';
import { AiExplanation } from '@/components/dictionary/AiExplanation';
import {
  TEXT_ACTION_ASK_AI_PRESETS,
  TEXT_ACTION_ASK_AI_INITIAL_PRESET,
} from '@langplayer/utils';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { MoreVertical, X } from 'lucide-react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { ZOOM_TO_REM } from '@/lib/text-scale';
import {
  ACTION_TRIGGER_DEFAULT_LEADING,
  ACTION_TRIGGER_SIZE_PX,
  actionTriggerBoxPx,
  actionTriggerFontPx,
  actionTriggerIconPx,
} from '@langplayer/utils';

interface TextActionMenuProps {
  /** Plain text content to act on. */
  text: string;
  /** Target language code for TTS + API calls. */
  l2Code: string;
  /** Native language code for translation target. Falls back to l1.code. */
  l1Code?: string;
  /** Surrounding context for AI explanation (full paragraph, etc.). */
  context?: string;
  /** Extra classes for the content row wrapper. */
  className?: string;
  /** Centers children in the full width and overlays the action button on the
   *  right — used for centered single-line subtitles. Default false. */
  centered?: boolean;
  /** Keeps the content row intrinsic-width instead of stretching it. */
  fitContent?: boolean;
  /** Extra multiplier on top of the user's zoom for the ⋮ trigger's size.
   *  Must match the `textScale` the adjacent tokenized text renders with
   *  (1.33 for single-line subtitles — SPEC-051's only non-default value);
   *  default 1. */
  triggerTextScale?: number;
  children: React.ReactNode;
}

type ActionKind = 'explain' | 'translate';

/**
 * Action menu for text blocks — copy, speak (TTS), AI explain, translate.
 *
 * Renders children (text content) with a ⋮ button beside them. On press,
 * opens a bottom sheet (via ContextMenu) with the available actions.
 * AI explain and translate open their own result modals.
 */
export function TextActionMenu(props: TextActionMenuProps) {
  const { text, l2Code, l1Code, context, className, centered = false, fitContent = false, triggerTextScale = 1, children } = props;
  const { l1Lang } = useLanguage();
  const effectiveL1 = l1Code ?? l1Lang.code;
  const t = useT();
  // ── Trigger geometry (shared rule, see @langplayer/utils/action-trigger) ──
  // The ⋮ trigger scales with the adjacent L2 text: the icon is the text's
  // rendered font size and the tap box spans one line pitch (font × leading),
  // so the icon centers vertically on the first line at any zoom/leading.
  // No `mt-1` — the box top edge IS the first line's top edge.
  const { tokenizedText: triggerTokenSettings } = useSettingsContext();
  const triggerFontPx = actionTriggerFontPx(ZOOM_TO_REM[triggerTokenSettings.zoom] ?? 1, triggerTextScale);
  const triggerBoxPx = actionTriggerBoxPx(triggerFontPx, triggerTokenSettings.leading ?? ACTION_TRIGGER_DEFAULT_LEADING);
  const triggerIconPx = actionTriggerIconPx(triggerFontPx);
  const { speak: speakTts, stop: stopTts, isSpeaking } = useSpeech();

  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [translateResult, setTranslateResult] = useState<string | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  /** "Ask AI" (the shared AiExplanation chat) open for this text block. */
  const [askAiOpen, setAskAiOpen] = useState(false);

  const closeAction = useCallback(() => {
    setActiveAction(null);
    setTranslateResult(null);
    setTranslateError(null);
  }, []);

  // ── Menu actions ──

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    Alert.alert(t('msg.copy_success'));
  }, [text, t]);

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopTts();
    } else {
      try {
        speakTts(text, l2Code);
      } catch {
        Alert.alert(t('error.occurred'));
      }
    }
  }, [text, l2Code, speakTts, stopTts, isSpeaking, t]);

  const handleTranslate = useCallback(async () => {
    setActiveAction('translate');
    setTranslateLoading(true);
    setTranslateResult(null);
    setTranslateError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l1: effectiveL1, l2: l2Code }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data?.translated_text ?? data?.translation ?? data?.text;
      setTranslateResult(raw ?? (typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200)));
    } catch (err: any) {
      setTranslateError(err?.message ?? t('error.occurred'));
    } finally {
      setTranslateLoading(false);
    }
  }, [text, l2Code, effectiveL1, t]);

  // ── Build native UIMenu actions ──
  // iOS SF Symbol per item (Android PopupMenu renders text-only). `imageColor`
  // must be set or New-Arch iOS 26 tints the icon transparent (see
  // ChannelActionsMenu for the react-native-menu#1034/#1200 workaround).

  const sf = (name: string) => (Platform.OS === 'ios' ? name : undefined);

  const actions = [
    {
      id: 'copy',
      title: t('action.copy'),
      image: sf('doc.on.doc'),
      imageColor: ICON_PRIMARY,
    },
    {
      id: 'speak',
      title: isSpeaking ? t('action.stop') : t('action.speak'),
      image: sf(isSpeaking ? 'stop.fill' : 'speaker.wave.2'),
      imageColor: ICON_PRIMARY,
    },
    {
      id: 'explain',
      title: t('action.let_ai_explain'),
      image: sf('sparkles'),
      imageColor: ICON_PRIMARY,
    },
    {
      id: 'translate',
      title: t('action.translation'),
      image: sf('character.bubble'),
      imageColor: ICON_PRIMARY,
    },
  ];

  const handleAction = useCallback(
    (event: string) => {
      switch (event) {
        case 'copy':
          void handleCopy();
          break;
        case 'speak':
          handleSpeak();
          break;
        case 'explain':
          setAskAiOpen(true);
          break;
        case 'translate':
          void handleTranslate();
          break;
      }
    },
    [handleCopy, handleSpeak, handleTranslate],
  );

  const menu = (
    <MenuView
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
      actions={actions}
    >
      <Pressable
        className="items-center justify-center rounded-md active:bg-muted"
        style={{ width: ACTION_TRIGGER_SIZE_PX, height: triggerBoxPx }}
        hitSlop={6}
        accessibilityRole="button"
      >
        <MoreVertical size={triggerIconPx} color={ICON_MUTED} />
      </Pressable>
    </MenuView>
  );

  return (
    <>
      {/* Content row with action button */}
      <View className={`gap-1 ${centered ? 'relative flex-col items-stretch' : 'flex-row items-start'} ${className ?? ''}`}>
        <View className={centered ? 'w-full pr-8' : fitContent ? 'items-start' : 'flex-1 min-w-0'}>
          {/* as any: @types/react ReactNode includes bigint; RN's View expects RN's ReactNode (excludes it).
              This is the standard workaround for the type mismatch in RN projects with @types/react installed. */}
          {children as any}
        </View>
        {centered ? (
          <View className="absolute right-0 top-0">{menu}</View>
        ) : (
          menu
        )}
      </View>

      {/* ── "Ask AI" Modal — the shared AiExplanation chat (the "Let DeepSeek
          Explain" component used everywhere else), auto-streaming a concise
          explanation and preloading the summarize / difficult expressions /
          grammar points presets. ── */}
      <Modal visible={askAiOpen} transparent animationType="fade" onRequestClose={() => setAskAiOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <View className="h-[80%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
                <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
                  {t('action.let_ai_explain')}
                </Text>
                <Pressable
                  onPress={() => setAskAiOpen(false)}
                  className="rounded p-1 active:bg-muted"
                  accessibilityRole="button"
                  accessibilityLabel={t('action.close')}
                >
                  <X size={18} color={ICON_MUTED} />
                </Pressable>
              </View>
              <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
                <AiExplanation
                  word={text}
                  contextText={undefined}
                  contextForm={undefined}
                  entryFound={true}
                  autoLoad
                  followUpPresets={TEXT_ACTION_ASK_AI_PRESETS}
                  initialPreset={TEXT_ACTION_ASK_AI_INITIAL_PRESET}
                  readerContent={{
                    text,
                    page: text,
                    chapter: null,
                    bookUpToChapter: null,
                  }}
                />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Translate Result Modal ── */}
      <Modal
        visible={activeAction === 'translate' && (!!translateResult || translateLoading || !!translateError)}
        transparent
        animationType="fade"
        onRequestClose={closeAction}
      >
        <Pressable className="flex-1 bg-black/50 justify-center px-4" onPress={closeAction}>
          <Pressable
            onPress={() => {}}
            className="rounded-xl bg-card p-5"
          >
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">
                {t('action.translation')}
              </Text>
              <Button onPress={closeAction} variant="ghost" size="icon">
                <X size={16} color={ICON_MUTED} />
              </Button>
            </View>
            {translateLoading ? (
              <ActivityIndicator size="small" color={ICON_MUTED} />
            ) : translateError ? (
              <Text className="text-sm text-destructive">{translateError}</Text>
            ) : (
              <Text className="text-sm leading-relaxed text-foreground">
                {renderInlineMarkdown(translateResult ?? '')}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
