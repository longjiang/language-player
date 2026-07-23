import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { htmlToMarkdown, extractTitle } from '@/lib/html-to-markdown';
import { parseMarkdownBlocks, type TextBlock } from '@/lib/parse-markdown';
import { TokenizedText } from '@/components/TokenizedText';
import { Globe } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function WebReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TextBlock[] | null>(null);

  const handleLoad = useCallback(async (loadUrl?: string) => {
    const targetUrl = loadUrl || url;
    if (!targetUrl.trim()) return;

    setLoading(true);
    setError(null);
    setBlocks(null);

    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const md = htmlToMarkdown(raw, targetUrl);
      const extractedTitle = extractTitle(raw) || targetUrl;
      setTitle(extractedTitle);
      setText(md);

      // Parse markdown for layout — TokenizedText handles its own tokenization
      try {
        const parsed = parseMarkdownBlocks(md);
        setBlocks(parsed);
      } catch {
        setBlocks(null);
      }
    } catch (e: any) {
      setError(e?.message || t('msg.failed_to_load_url'));
    } finally {
      setLoading(false);
    }
  }, [url, t]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        {/* ── Header ── */}
        <View className="px-4 pt-5 pb-3 flex-row items-center gap-3">
          <Globe size={24} color={ICON_MUTED} />
          <View className="flex-1 min-w-0">
            <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
              {title || t('title.web_reader')}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {l2Lang.name} → {l1Lang.name}
            </Text>
          </View>
        </View>

        {/* ── URL input ── */}
        <View className="px-4 mb-4">
          <View className="flex-row gap-2">
            <View className="flex-1 relative flex-row items-center rounded-lg border border-border bg-background">
              <View className="pl-3">
                <Globe size={16} color={ICON_MUTED} />
              </View>
              <TextInput
                className="flex-1 py-2 pr-3 text-sm text-foreground"
                value={url}
                onChangeText={setUrl}
                placeholder={t('placeholder.paste_url', { l2: l2Lang.name })}
                placeholderTextColor={ICON_MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => handleLoad()}
              />
            </View>
            <Pressable
              onPress={() => handleLoad()}
              disabled={!url.trim() || loading}
              className={`rounded-lg px-4 py-2 items-center justify-center ${!url.trim() || loading ? 'bg-muted' : 'bg-primary'}`}
            >
              {loading ? (
                <ActivityIndicator size="small" color={ICON_MUTED} />
              ) : (
                <Text className={`text-sm font-medium ${!url.trim() || loading ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                  {t('action.load')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── Error ── */}
        {error && (
          <View className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-950">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {/* ── Content: parsed blocks — TokenizedText handles its own tokenization ── */}
        {blocks && (
          <View className="px-4 pb-8">
            {blocks.map((block, bi) => (
              <View key={bi} className="mb-3">
                {block.type === 'heading' && (
                  <Text
                    className={`mb-2 font-bold text-foreground ${
                      block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'
                    }`}
                  >
                    {block.text}
                  </Text>
                )}
                {block.type === 'paragraph' && (
                  <TokenizedText
                    text={block.text}
                    l2Code={l2Lang.code}
                  />
                )}
                {block.type === 'blockquote' && (
                  <View className="border-l-2 border-muted-foreground/30 pl-3">
                    <TokenizedText
                      text={block.text}
                      l2Code={l2Lang.code}
                    />
                  </View>
                )}
                {block.type === 'list-item' && (
                  <View className="flex-row">
                    <Text className="mr-2 text-muted-foreground">•</Text>
                    <View className="flex-1">
                      <TokenizedText
                        text={block.text}
                        l2Code={l2Lang.code}
                      />
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Loading state: spinner ── */}
        {loading && !text && (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator size="large" color={ICON_MUTED} />
          </View>
        )}

        {/* ── Empty state ── */}
        {!text && !loading && (
          <View className="flex-1 items-center justify-center py-16 px-4">
            <Globe size={48} color={ICON_MUTED} style={{ opacity: 0.4 }} />
            <Text className="mt-3 text-lg font-semibold text-muted-foreground">
              {t('title.web_reader')}
            </Text>
            <Text className="mt-1 max-w-md text-center text-sm text-muted-foreground">
              {t('msg.web_reader_empty_state', { l2: l2Lang.name })}
            </Text>
          </View>
        )}
      </ScrollView>

    </View>
  );
}
