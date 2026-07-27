import React, { useState, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useSpeech } from '@/hooks/use-speech';
import { useStreamingExplanation } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { MarkdownText } from '@/components/MarkdownText';
import { TokenizedText } from '@/components/TokenizedText';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import {
  MoreVertical, Copy, Volume2, Square, Sparkles, Languages, X,
} from 'lucide-react-native';

interface TextActionMenuProps {
  /** Plain text content to act on. */
  text: string;
  /** Target language code for TTS + API calls. */
  l2Code: string;
  /** Native language code for translation target. Falls back to l1.code. */
  l1Code?: string;
  /** Surrounding context for AI explanation (full paragraph, etc.). */
  context?: string;
  children: React.ReactNode;
}

type ActionKind = 'copy' | 'speak' | 'explain' | 'translate';

/**
 * Action menu for text blocks — copy, speak (TTS), AI explain, translate.
 *
 * Renders a ⋮ button beside the content. On press, opens a bottom sheet
 * with the available actions. Each action provides platform-appropriate
 * feedback (clipboard copy toast, TTS audio, modal explanation, inline
 * translation text).
 */
export function TextActionMenu(props: TextActionMenuProps) {
  const { text, l2Code, l1Code, context, children } = props;
  const { l1Lang } = useLanguage();
  const effectiveL1 = l1Code ?? l1Lang.code;
  const t = useT();
  const { speak: speakTts, stop: stopTts, isSpeaking } = useSpeech();
  const {
    text: explainText,
    error: explainError,
    loading: explainLoading,
    stream: streamExplain,
    reset: resetExplain,
  } = useStreamingExplanation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [translateResult, setTranslateResult] = useState<string | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const closeAction = useCallback(() => {
    setActiveAction(null);
    setTranslateResult(null);
    setTranslateError(null);
    resetExplain();
  }, [resetExplain]);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    Alert.alert(t('msg.copy_success'));
    closeMenu();
  }, [text, t, closeMenu]);

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopTts();
    } else {
      speakTts(text, l2Code);
    }
    closeMenu();
  }, [text, l2Code, speakTts, stopTts, isSpeaking, closeMenu]);

  const handleExplain = useCallback(() => {
    setActiveAction('explain');
    setMenuOpen(false);
    const l1Name = l1Lang.name;
    const header = t('prompt.explain_block_header', { l2Code });
    const item1 = t('prompt.explain_block_item1', { l1Name });
    const item2 = t('prompt.explain_block_item2');
    const textLabel = t('prompt.explain_text_label');
    const lines = [header, `1. ${item1}`, `2. ${item2}`];
    if (context) {
      const ctxLabel = t('prompt.explain_context_label');
      lines.push('', `${ctxLabel}: ${context}`);
    }
    lines.push('', `${textLabel}: ${text}`);
    streamExplain(lines.join('\n'));
  }, [text, l2Code, context, l1Lang.name, t, streamExplain]);

  const handleTranslate = useCallback(async () => {
    setActiveAction('translate');
    setMenuOpen(false);
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
      setTranslateResult(data?.translated_text ?? data?.translation ?? data?.text ?? JSON.stringify(data));
    } catch (err: any) {
      setTranslateError(err?.message ?? t('error.occurred'));
    } finally {
      setTranslateLoading(false);
    }
  }, [text, l2Code, effectiveL1, t]);

  const menuItems: {
    kind: ActionKind;
    icon: React.ComponentType<{ size: number; color: string }>;
    label: string;
    onPress: () => void;
    loading?: boolean;
  }[] = [
    { kind: 'copy', icon: Copy, label: t('action.copy'), onPress: handleCopy },
    {
      kind: 'speak',
      icon: isSpeaking ? Square : Volume2,
      label: isSpeaking ? t('action.stop') : t('action.speak'),
      onPress: handleSpeak,
    },
    {
      kind: 'explain',
      icon: Sparkles,
      label: t('action.let_ai_explain'),
      onPress: handleExplain,
      loading: activeAction === 'explain' && explainLoading,
    },
    {
      kind: 'translate',
      icon: Languages,
      label: t('action.translation'),
      onPress: handleTranslate,
      loading: activeAction === 'translate' && translateLoading,
    },
  ];

  return (
    <>
      {/* Content row with action button */}
      <View className="flex-row items-start gap-1">
        <View className="flex-1 min-w-0">
          {children as any}
        </View>
        <Pressable
          onPress={() => setMenuOpen(true)}
          className="mt-1 h-7 w-7 items-center justify-center rounded-md active:bg-muted"
          hitSlop={6}
        >
          <MoreVertical size={16} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* ── Action Menu Bottom Sheet ── */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={closeMenu}>
          <Pressable
            onPress={() => {}}
            className="rounded-t-2xl bg-card px-4 pb-8 pt-2"
          >
            {/* Handle bar */}
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>

            {menuItems.map((item) => (
              <Pressable
                key={item.kind}
                onPress={item.onPress}
                disabled={item.loading}
                className="flex-row items-center gap-3 rounded-lg px-4 py-3.5 active:bg-muted"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  {item.loading ? (
                    <ActivityIndicator size="small" color={ICON_MUTED} />
                  ) : (
                    <item.icon size={16} color={ICON_PRIMARY} />
                  )}
                </View>
                <Text className="text-base text-foreground">{item.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── AI Explain Modal ── */}
      <Modal
        visible={activeAction === 'explain' && (!!explainText || explainLoading || !!explainError)}
        transparent
        animationType="fade"
        onRequestClose={closeAction}
      >
        <Pressable className="flex-1 bg-black/50 justify-center px-4" onPress={closeAction}>
          <Pressable
            onPress={() => {}}
            className="max-h-[80%] rounded-xl bg-card"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  {t('action.let_ai_explain')}
                </Text>
                {explainLoading && <ActivityIndicator size="small" color={ICON_MUTED} />}
              </View>
              <Pressable onPress={closeAction} className="rounded p-1 active:bg-muted">
                <X size={16} color={ICON_MUTED} />
              </Pressable>
            </View>

            {/* Body */}
            <ScrollView className="px-5 py-4">
              {/* Original text — tokenized */}
              <View className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
                <TokenizedText text={text} l2Code={l2Code} />
              </View>

              {/* DeepSeek breakdown */}
              {explainError && !explainText ? (
                <Text className="text-sm text-destructive">{explainError}</Text>
              ) : (
                <View>
                  <MarkdownText>{explainText || ''}</MarkdownText>
                </View>
              )}
              {explainError && explainText ? (
                <Text className="mt-2 text-xs text-destructive">{explainError}</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
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
              <Pressable onPress={closeAction} className="rounded p-1 active:bg-muted">
                <X size={16} color={ICON_MUTED} />
              </Pressable>
            </View>
            {translateLoading ? (
              <ActivityIndicator size="small" color={ICON_MUTED} />
            ) : translateError ? (
              <Text className="text-sm text-destructive">{translateError}</Text>
            ) : (
              <Text className="text-sm leading-relaxed text-foreground">{translateResult}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
