import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_PRIMARY, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { Sparkles, Send, X } from 'lucide-react-native';

/**
 * System-style preamble for docs questions: keeps the assistant focused on
 * how to use Language Player and honest about what it doesn't know.
 */
const ASK_AI_PREAMBLE =
  'You are the Language Player help assistant. Language Player is a language ' +
  'learning platform: authentic videos with interactive dual subtitles, a popup ' +
  'dictionary, a reader for ebooks/PDFs/images, saved words, SRS review, and ' +
  'device sync. Answer the question about how to use the app concisely and ' +
  'practically, in the user\u2019s own language. If you don\u2019t know, say so ' +
  'and point them to the documentation.';

/** Ask-AI modal for the docs (web docs AskAiDialog parity). */
function AskAiSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const [question, setQuestion] = useState('');
  const { text, error, loading, stream, reset } = useStreamingExplanation();

  const ask = useCallback(() => {
    const q = question.trim();
    if (!q || loading) return;
    void stream(`${ASK_AI_PREAMBLE}\n\nQuestion: ${q}`);
  }, [question, loading, stream]);

  const close = useCallback(() => {
    onClose();
    reset();
    setQuestion('');
  }, [onClose, reset]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 justify-center bg-black/40 px-6">
          <View className="max-h-[80%] w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="flex-1 text-base font-semibold text-foreground">
                {t('action.ask_ai')}
              </Text>
              <Pressable
                onPress={close}
                className="rounded p-1 active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('action.close')}
              >
                <X size={18} color={ICON_MUTED} />
              </Pressable>
            </View>
            <View className="p-4">
              <TextInput
                multiline
                value={question}
                onChangeText={setQuestion}
                placeholder={t('docs.ask_ai_placeholder')}
                placeholderTextColor={ICON_MUTED}
                className="min-h-[80px] rounded-md border border-border bg-background p-3 text-sm text-foreground"
                accessibilityLabel={t('docs.ask_ai_placeholder')}
              />
              <View className="mt-3 items-end">
                <Button
                  onPress={ask}
                  disabled={loading || !question.trim()}
                  size="sm"
                  accessibilityRole="button"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={ICON_ON_PRIMARY} />
                  ) : (
                    <Send size={14} color={ICON_ON_PRIMARY} />
                  )}
                  <Text className={buttonTextClass('default')}>{t('action.ask_ai')}</Text>
                </Button>
              </View>
              {text ? (
                <ScrollView className="mt-3 max-h-56 rounded-md border border-border bg-muted/40 p-3">
                  <Text className="text-sm leading-5 text-foreground">{text}</Text>
                </ScrollView>
              ) : null}
              {loading && !text ? (
                <View className="mt-3 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={ICON_MUTED} />
                  <Text className="text-xs text-muted-foreground">{t('msg.loading')}</Text>
                </View>
              ) : null}
              {error ? (
                <Text className="mt-2 text-xs text-destructive">{error}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Ready-to-mount "Ask AI" button + modal for the docs screens (listing and
 * detail views) — asks questions about how to use the app.
 */
export function AskAiButton({ label = true }: { label?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onPress={() => setOpen(true)}
        variant="outline"
        size="sm"
        accessibilityRole="button"
        accessibilityLabel={t('action.ask_ai')}
      >
        <Sparkles size={14} color={ICON_PRIMARY} />
        {label && <Text className={buttonTextClass('outline')}>{t('action.ask_ai')}</Text>}
      </Button>
      <AskAiSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
