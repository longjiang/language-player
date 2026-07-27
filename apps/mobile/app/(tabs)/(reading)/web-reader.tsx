import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useReaderNotes } from '@/hooks/use-reader-notes';
import { PYTHON_API_URL } from '@/lib/api-url';
import { htmlToMarkdown, extractTitle } from '@/lib/html-to-markdown';
import { parseMarkdownBlocks, type ContentBlock } from '@/lib/parse-markdown';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { Globe, StickyNote, Plus, Trash2, BookOpen } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function WebReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const notes = useReaderNotes(l2Lang.code);

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');

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

  // Notes rename
  const handleRenameSubmit = async () => {
    if (renameId !== null && renameText.trim()) {
      await notes.renameNote(renameId, renameText.trim());
      setRenameId(null);
    }
  };

  // Notes delete
  const handleDelete = (noteId: number) => {
    Alert.alert(t('action.delete'), t('msg.confirm_delete_note'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.delete'), style: 'destructive', onPress: () => notes.deleteNote(noteId) },
    ]);
  };

  return (
    <PageContainer>
      {/* Main content row */}
      <View className="flex-1 flex-row">
        <View className="flex-1">
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        {/* ── Header ── */}
        <View className="px-4 pt-5 pb-3 flex-row items-center gap-3">
          <Globe size={24} color={ICON_MUTED} />
          <View className="flex-1 min-w-0">
            <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
              {title || t('title.web_reader')}
            </Text>
          </View>
          <Pressable
            onPress={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-1.5 active:bg-muted"
          >
            <StickyNote size={18} color={ICON_MUTED} />
          </Pressable>
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
                placeholder={t('placeholder.paste_url', { l2: t(`lang.${l2Lang.code}`) })}
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
            {blocks.map((block, bi) => {
              if (block.kind !== 'text') return null;
              return (
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
                  <TextActionMenu text={block.text} l2Code={l2Lang.code}>
                    <TokenizedText
                      text={block.text}
                      l2Code={l2Lang.code}
                    />
                  </TextActionMenu>
                )}
                {block.type === 'blockquote' && (
                  <TextActionMenu text={block.text} l2Code={l2Lang.code}>
                    <View className="border-l-2 border-muted-foreground/30 pl-3">
                      <TokenizedText
                        text={block.text}
                        l2Code={l2Lang.code}
                      />
                    </View>
                  </TextActionMenu>
                )}
                {block.type === 'list-item' && (
                  <TextActionMenu text={block.text} l2Code={l2Lang.code}>
                    <View className="flex-row">
                      <Text className="mr-2 text-muted-foreground">•</Text>
                      <View className="flex-1">
                        <TokenizedText
                          text={block.text}
                          l2Code={l2Lang.code}
                        />
                      </View>
                    </View>
                  </TextActionMenu>
                )}
              </View>
            )})}
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
              {t('msg.web_reader_empty_state', { l2: t(`lang.${l2Lang.code}`) })}
            </Text>
          </View>
        )}
          </ScrollView>
        </View>

        {/* ── Notes Sidebar ── */}
        {sidebarOpen && (
          <View className="w-56 border-l border-border bg-card">
            <View className="border-b border-border px-3 py-2">
              <Text className="text-sm font-semibold text-foreground">{t('title.notes')}</Text>
            </View>
            <Pressable
              onPress={() => notes.createNote()}
              className="mx-3 my-2 flex-row items-center gap-1.5 rounded-lg border border-border px-3 py-2 active:bg-muted"
            >
              <Plus size={14} color={ICON_MUTED} />
              <Text className="text-xs text-foreground">{t('action.new_note')}</Text>
            </Pressable>

            <ScrollView className="flex-1">
              {notes.notesLoading && (
                <ActivityIndicator size="small" color={ICON_MUTED} style={{ marginTop: 20 }} />
              )}
              {notes.notesError && (
                <Text className="px-3 py-4 text-xs text-red-500">{notes.notesError}</Text>
              )}
              {!notes.notesLoading && notes.notes.length === 0 && (
                <Text className="px-3 py-4 text-xs text-muted-foreground">{t('msg.no_notes_yet')}</Text>
              )}
              {notes.notes.map((n) => (
                <View key={n.id}>
                  {renameId === n.id ? (
                    <View className="flex-row items-center px-2 py-1">
                      <TextInput
                        className="flex-1 rounded border border-border px-2 py-1 text-xs text-foreground"
                        value={renameText}
                        onChangeText={setRenameText}
                        onSubmitEditing={handleRenameSubmit}
                        onBlur={handleRenameSubmit}
                        autoFocus
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => notes.selectNote(n.id)}
                      onLongPress={() => {
                        setRenameId(n.id);
                        setRenameText(n.title ?? '');
                      }}
                      className={`flex-row items-center gap-2 px-3 py-2 active:bg-muted ${notes.currentNoteId === n.id ? 'bg-primary/10' : ''}`}
                    >
                      <StickyNote size={14} color={ICON_MUTED} />
                      <View className="flex-1">
                        <Text className={`text-sm truncate ${notes.currentNoteId === n.id ? 'font-medium text-primary' : 'text-foreground'}`} numberOfLines={1}>
                          {n.title ?? t('msg.untitled_note')}
                        </Text>
                        {n.created_on && (
                          <Text className="text-xs text-muted-foreground">
                            {new Date(n.created_on).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      <Pressable onPress={() => handleDelete(n.id)} className="rounded p-1 active:bg-muted">
                        <Trash2 size={12} color={ICON_MUTED} />
                      </Pressable>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </PageContainer>
  );
}
