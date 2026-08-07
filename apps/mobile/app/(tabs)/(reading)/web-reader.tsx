import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PYTHON_API_URL } from '@/lib/api-url';
import { htmlToMarkdown, extractTitle } from '@/lib/html-to-markdown';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { VisitedSitesSidebar } from '@/components/reader/VisitedSitesSidebar';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { saveUrlAnchor, getUrlAnchor } from '@/lib/reader-storage';
import {
  loadVisitedSites,
  recordVisit,
  removeVisitedSite,
  renameVisitedSite,
  type VisitedSite,
} from '@/lib/reader-history';
import { getReadingSuggestions, type ReadingCategory, type ReadingSuggestionItem } from '@langplayer/shared';
import { Globe, Home, PanelRightOpen, PanelRightClose } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function WebReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  /** Visited-sites history (SPEC-049 §10.3) — shown in the sidebar (web parity). */
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

  /** Open a visited site from the sidebar — closes the mobile sheet (web parity). */
  const handleLoadSite = useCallback((siteUrl: string) => {
    setMobileOpen(false);
    void handleLoad(siteUrl);
  }, [handleLoad, setMobileOpen]);

  const handleRenameSite = useCallback(async (siteUrl: string, newTitle: string) => {
    const next = await renameVisitedSite(siteUrl, newTitle);
    setVisitedSites(next);
  }, []);

  const handleDeleteSite = useCallback(async (siteUrl: string) => {
    const next = await removeVisitedSite(siteUrl);
    setVisitedSites(next);
  }, []);

  return (
    <PageContainer>
      {/* Main content — persistent panel on wide screens, sheet on narrow */}
      <View className="flex-1 pt-2" style={{ flexDirection: isWide ? 'row' : 'column' }}>
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
                onPress={toggle}
                className="rounded p-1.5 active:bg-muted"
                accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
                accessibilityRole="button"
              >
                {isWide && sidebarOpen ? (
                  <PanelRightClose size={18} color={ICON_MUTED} />
                ) : (
                  <PanelRightOpen size={18} color={ICON_MUTED} />
                )}
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

            {/* ── Empty state: suggestions only (visited sites live in the sidebar) ── */}
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
              </View>
            )}
          </ScrollView>
        </View>

        {/* Visited-sites sidebar — shared panel + sheet (web parity) */}
        <Sidebar
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sidebarOpen={sidebarOpen}
          title={t('title.visited_sites')}
        >
          <VisitedSitesSidebar
            sites={visitedSites}
            onLoad={handleLoadSite}
            onRename={handleRenameSite}
            onDelete={handleDeleteSite}
          />
        </Sidebar>
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
