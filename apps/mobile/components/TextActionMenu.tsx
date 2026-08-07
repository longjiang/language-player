import React, { useState, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useSpeech } from '@/hooks/use-speech';
import { useStreamingExplanation } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { MarkdownText } from '@/components/MarkdownText';
import { TokenizedText } from '@/components/TokenizedText';
import { ContextMenu } from '@/components/ui/context-menu';
import type { ContextMenuItem } from '@/components/ui/context-menu';
import { ICON_MUTED } from '@/lib/theme-colors';
import {
  Copy, Volume2, Square, Sparkles, Languages, X,
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
  /** Extra classes for the content row wrapper. */
  className?: string;
  /** Centers children in the full width and overlays the action button on the
   *  right — used for centered single-line subtitles. Default false. */
  centered?: boolean;
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
  const { text, l2Code, l1Code, context, className, centered = false, children } = props;
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
  const [contextExpanded, setContextExpanded] = useState(false);

  const closeAction = useCallback(() => {
    setActiveAction(null);
    setTranslateResult(null);
    setTranslateError(null);
    setContextExpanded(false);
    resetExplain();
  }, [resetExplain]);

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

  const handleExplain = useCallback(() => {
    setActiveAction('explain');
    const l1Name = l1Lang?.name ?? '';
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
  }, [text, l2Code, context, l1Lang, t, streamExplain]);

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

  // ── Build ContextMenu items ──

  const menuItems: ContextMenuItem[] = [
    {
      key: 'copy',
      icon: Copy,
      label: t('action.copy'),
      onPress: handleCopy,
    },
    {
      key: 'speak',
      icon: isSpeaking ? Square : Volume2,
      label: isSpeaking ? t('action.stop') : t('action.speak'),
      onPress: handleSpeak,
    },
    {
      key: 'explain',
      icon: Sparkles,
      label: t('action.let_ai_explain'),
      onPress: handleExplain,
      loading: activeAction === 'explain' && explainLoading,
    },
    {
      key: 'translate',
      icon: Languages,
      label: t('action.translation'),
      onPress: handleTranslate,
      loading: activeAction === 'translate' && translateLoading,
    },
  ];

  const menu = (
    <ContextMenu
      items={menuItems}
      open={menuOpen}
      onOpenChange={setMenuOpen}
      triggerClassName="mt-1 h-7 w-7 items-center justify-center rounded-md active:bg-muted"
      triggerSize={16}
    />
  );

  return (
    <>
      {/* Content row with action button */}
      <View className={`flex-row items-start gap-1 ${className ?? ''} ${centered ? 'relative' : ''}`}>
        <View className={centered ? 'w-full pr-8' : 'flex-1 min-w-0'}>
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

      {/* ── AI Explain Modal ── */}
      <Modal
        visible={activeAction === 'explain' && (!!explainText || explainLoading || !!explainError)}
        transparent
        animationType="fade"
        onRequestClose={closeAction}
      >
        <View className="flex-1 bg-black/50 justify-center px-4">
          {/* Backdrop: absolute overlay for tap-to-close, doesn't block scroll */}
          <Pressable className="absolute inset-0" onPress={closeAction} />
          <View
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
              {/* Original text — tokenized, collapsible to 4 lines */}
              <View className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
                <View className={contextExpanded ? '' : 'max-h-[4.5rem] overflow-hidden'}>
                  <TokenizedText text={text} l2Code={l2Code} />
                </View>
                {contextExpanded ? (
                  <Pressable onPress={() => setContextExpanded(false)} className="mt-1">
                    <Text className="text-xs font-medium text-primary">{t('action.show_less')}</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setContextExpanded(true)} className="mt-1">
                    <Text className="text-xs font-medium text-primary">{t('action.show_more')}</Text>
                  </Pressable>
                )}
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
          </View>
        </View>
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
