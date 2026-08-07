import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useReaderNotes } from '@/hooks/use-reader-notes';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PYTHON_API_URL } from '@/lib/api-url';
import { htmlToMarkdown, extractTitle } from '@/lib/html-to-markdown';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { saveUrlAnchor, getUrlAnchor } from '@/lib/reader-storage';
import { loadVisitedSites, recordVisit, removeVisitedSite, type VisitedSite } from '@/lib/reader-history';
import { getReadingSuggestions, type ReadingCategory, type ReadingSuggestionItem } from '@langplayer/shared';
import { Globe, Plus, MoreHorizontal, PenLine, Trash2, Check, PanelRightOpen, Home, Clock } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED, ICON_PRIMARY, ICON_DESTRUCTIVE } from '@/lib/theme-colors';

const SIDEBAR_MAX_WIDTH = 400;

export default function WebReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const notes = useReaderNotes(l2Lang.code);
  const { width: screenWidth } = useWindowDimensions();
  const sidebarWidth = Math.min(screenWidth - 32, SIDEBAR_MAX_WIDTH);

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuNoteId, setMenuNoteId] = useState<number | null>(null);
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  /** Visited-sites history (SPEC-049 §10.3). */
  const [visitedSites, setVisitedSites] = useState<VisitedSite[]>([]);

  // Load visited-sites history on mount and when L2 changes.
  useEffect(() => {
    loadVisitedSites().then(setVisitedSites);
  }, [l2Lang.code]);

  const handleAnchorChange = useCallback((anchor: string) => {
    saveUrlAnchor(url || title, anchor);
  }, [url, title]);

  const pagination = useEpubPagination({
    text,
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    resetKey: title || null,
    initialAnchor,
    onAnchorChange: handleAnchorChange,
  });

  const handleLoad = useCallback(async (loadUrl?: string) => {
    const targetUrl = loadUrl || url;
    if (!targetUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const md = htmlToMarkdown(raw, targetUrl);
      const extractedTitle = extractTitle(raw) || targetUrl;
      setTitle(extractedTitle);
      setText(md);
      setUrl(targetUrl);
      // Load saved anchor for this URL
      const savedAnchor = await getUrlAnchor(targetUrl);
      setInitialAnchor(savedAnchor);
      // Track the visit (SPEC-049 §10.3)
      recordVisit(targetUrl, extractedTitle).then(setVisitedSites);
    } catch (e: any) {
      setError(e?.message || t('msg.failed_to_load_url'));
    } finally {
      setLoading(false);
    }
  }, [url, t]);

  /** Back to the reader home (clear the loaded article) — SPEC-049 §10.4. */
  const handleHome = useCallback(() => {
    setText('');
    setTitle('');
    setError(null);
  }, []);

  // Notes rename — tracks original title to skip no-op API calls
  const [originalTitle, setOriginalTitle] = useState('');
  const handleRenameSubmit = async () => {
    if (renameId !== null && renameText.trim()) {
      if (renameText.trim() === originalTitle.trim()) {
        setRenameId(null);
        return;
      }
      try {
        await notes.renameNote(renameId, renameText.trim());
        setRenameId(null);
      } catch {
        Alert.alert(t('error.occurred'));
      }
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
      {/* Main content — sidebar overlays content when open */}
      <View className="flex-1 pt-2">
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
          {!!title && (
            <Pressable
              onPress={handleHome}
              className="rounded p-1.5 active:bg-muted"
              accessibilityLabel={t('title.web_reader')}
            >
              <Home size={18} color={ICON_MUTED} />
            </Pressable>
          )}
          <Pressable
            onPress={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-1.5 active:bg-muted"
            accessibilityLabel={t('title.notes')}
            accessibilityRole="button"
          >
            <PanelRightOpen size={18} color={ICON_MUTED} />
          </Pressable>
        </View>

        {/* ── URL input ── */}
        <View className="px-4 mb-4">
          <View className="flex-row gap-2">
            <View className="flex-1 relative flex-row items-center rounded-lg border border-border bg-background">
              <TextInput
                className="flex-1 px-3 py-2 text-sm text-foreground"
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

        {/* ── Content: PaginatedReader ── */}
        {text && pagination.blocks && (
          <View className="flex-1">
            <PaginatedReader
              blocks={pagination.blocks}
              visibleBlocks={pagination.visibleBlocks}
              page={pagination.page}
              totalPages={pagination.totalPages}
              hasMeasured={pagination.hasMeasured}
              loadingTokens={pagination.loadingTokens}
              tokenCache={pagination.tokenCache}
              blockTranslations={pagination.blockTranslations}
              prevPage={pagination.prevPage}
              nextPage={pagination.nextPage}
              goToPage={pagination.goToPage}
              handleMeasureBlock={pagination.handleMeasureBlock}
              contentWidth={pagination.contentWidth}
              l2Code={l2Lang.code}
              l1Code={l1Lang.code}
              showTranslation={display.translation}
              onToggleTranslation={() => updateDisplay({ translation: !display.translation })}
              showTextActions
              t={t}
            />
          </View>
        )}

        {/* ── Loading state: spinner ── */}
        {loading && !text && (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator size="large" color={ICON_MUTED} />
          </View>
        )}

        {/* ── Empty state: suggestions + visited sites ── */}
        {!text && !loading && (
          <View className="flex-1 px-4 py-6">
            <View className="items-center mb-6">
              <Globe size={48} color={ICON_MUTED} style={{ opacity: 0.4 }} />
              <Text className="mt-3 text-lg font-semibold text-muted-foreground">
                {t('title.web_reader')}
              </Text>
              <Text className="mt-1 max-w-md text-center text-sm text-muted-foreground">
                {t('msg.web_reader_empty_state', { l2: t(`lang.${l2Lang.code}`) })}
              </Text>
            </View>

            {/* Curated reading suggestions (SPEC-049 §10.1) */}
            <ReadingSuggestionsList
              l2Code={l2Lang.code}
              onLoad={handleLoad}
            />

            {/* Visited sites (SPEC-049 §10.3) */}
            {visitedSites.length > 0 && (
              <View className="mt-6">
                <Text className="mb-2 text-xs font-medium text-muted-foreground">
                  {t('title.visited_sites')}
                </Text>
                {visitedSites.map((site) => (
                  <Pressable
                    key={site.url}
                    onPress={() => handleLoad(site.url)}
                    className="flex-row items-center gap-2 border-b border-border py-2.5 active:bg-muted"
                  >
                    <Clock size={14} color={ICON_MUTED} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm text-foreground" numberOfLines={1}>{site.title}</Text>
                      <Text className="text-[10px] text-muted-foreground/70" numberOfLines={1}>{site.url}</Text>
                    </View>
                    <Text className="text-[10px] text-muted-foreground/70">
                      {new Date(site.visitedAt).toLocaleDateString(l1Lang.code)}
                    </Text>
                    <Pressable
                      onPress={() => removeVisitedSite(site.url).then(setVisitedSites)}
                      className="rounded p-1 active:bg-muted"
                      hitSlop={8}
                    >
                      <Trash2 size={14} color={ICON_MUTED} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
          </ScrollView>
        </View>

        {/* ── Notes Sidebar — overlay ── */}
        {sidebarOpen && (
          <View className="absolute right-0 top-0 bottom-0 z-10 border-l border-border bg-card shadow-lg" style={{ width: sidebarWidth, elevation: 8 }}>
            <View className="border-b border-border px-3 py-2">
              <Text className="text-sm font-semibold text-foreground">{t('title.notes')}</Text>
            </View>
            <Pressable
              onPress={() => notes.createNote(t('msg.untitled_note'))}
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
                      onPress={() => { notes.selectNote(n.id); setSidebarOpen(false); }}
                      className={`flex-row items-center gap-2 px-3 py-2 active:bg-muted ${notes.currentNoteId === n.id ? 'bg-primary/10' : ''}`}
                    >
                      <Check size={14} color={ICON_PRIMARY} />
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
                      <Pressable
                        onPress={() => setMenuNoteId(menuNoteId === n.id ? null : n.id)}
                        className="rounded p-1 active:bg-muted"
                      >
                        <MoreHorizontal size={14} color={ICON_MUTED} />
                      </Pressable>
                    </Pressable>
                  )}

                  {/* Context menu */}
                  {menuNoteId === n.id && (
                    <View className="absolute right-2 top-10 z-20 min-w-[120px] rounded-lg border border-border bg-card py-1 shadow-lg" style={{ elevation: 8 }}>
                      <Pressable
                        onPress={() => { setMenuNoteId(null); setRenameId(n.id); setRenameText(n.title ?? ''); setOriginalTitle(n.title ?? ''); }}
                        className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                      >
                        <PenLine size={12} color={ICON_MUTED} />
                        <Text className="text-xs text-foreground">{t('action.rename')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { setMenuNoteId(null); handleDelete(n.id); }}
                        className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                      >
                        <Trash2 size={12} color={ICON_DESTRUCTIVE} />
                        <Text className="text-xs text-red-500">{t('action.delete')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
              {/* Tappable backdrop to close menu */}
              {menuNoteId !== null && (
                <Pressable
                  onPress={() => setMenuNoteId(null)}
                  className="absolute inset-0 z-10"
                />
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </PageContainer>
  );
}

/**
 * Curated reading suggestions for the current L2 (SPEC-049 §10.1), grouped by
 * category. Uses the shared getReadingSuggestions() (curated JSON per language,
 * falling back to a derived Wikipedia suggestion).
 */
function ReadingSuggestionsList({ l2Code, onLoad }: { l2Code: string; onLoad: (url: string) => void }) {
  const t = useT();
  const suggestions = getReadingSuggestions(l2Code.split('-')[0]);
  if (!suggestions) return null;

  return (
    <View>
      <Text className="mb-2 text-xs font-medium text-muted-foreground">
        {t('title.suggested_reading')}
      </Text>
      {(Object.keys(suggestions) as ReadingCategory[]).map((category) => {
        const items = suggestions[category];
        if (!items || items.length === 0) return null;
        return (
          <View key={category} className="mb-4">
            <Text className="mb-1 text-xs text-muted-foreground/70">{category}</Text>
            {items.map((item: ReadingSuggestionItem) => (
              <Pressable
                key={item.url}
                onPress={() => onLoad(item.url)}
                className="py-2 border-b border-border active:bg-muted"
              >
                <Text className="text-sm text-primary" numberOfLines={2}>{item.title}</Text>
                <Text className="mt-0.5 text-[10px] text-muted-foreground/70" numberOfLines={1}>{item.url}</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}
