import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { localizedError } from '@/lib/errors';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PYTHON_API_URL } from '@/lib/api-url';
import { htmlToMarkdown, extractTitle } from '@/lib/html-to-markdown';
import { fetchReaderPage } from '@langplayer/shared';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { ReaderAskAiSheet } from '@/components/reader/ReaderAskAiSheet';
import { READER_ASK_AI_TEXT_PRESETS, truncateReaderAiContent, type ReaderAiContent } from '@langplayer/utils';
import { useReaderTocSearch, ReaderTocSearchOverlays } from '@/components/reader/reader-toc-search';
import { VisitedSitesSidebar } from '@/components/reader/VisitedSitesSidebar';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { saveUrlAnchor, getUrlAnchor } from '@/lib/reader-storage';
import { log as appLog } from '@/lib/logger';import {
  loadVisitedSites,
  recordVisit,
  removeVisitedSite,
  renameVisitedSite,
  type VisitedSite,
} from '@/lib/reader-history';
import { getReadingSuggestions, READING_CATEGORIES } from '@langplayer/shared';
import { Globe, Home, PanelRightOpen, PanelRightClose } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { OfflineFeatureNotice } from '@/components/OfflineFeatureNotice';
import { ICON_MUTED } from '@/lib/theme-colors';

const log = appLog;

/** Google favicon for a URL's host — mirrors the web reader suggestion cards. */
function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : '';
  } catch {
    return '';
  }
}

export default function WebReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const { url: urlParam } = useLocalSearchParams<{ url?: string }>();
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();
  // Reader translation goes side-by-side from md (>=768px) — portrait iPads —
  // while the outer sidebar layout still switches at the wider breakpoint.
  const { isMd } = useResponsive();

  const [url, setUrl] = useState(
    typeof urlParam === 'string' ? urlParam : '',
  );
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  /** Reader's current global block (for the TOC active-entry highlight). */
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number | null>(null);
  /** Visited-sites history (SPEC-049 §10.3) — shown in the sidebar (web parity). */
  const [visitedSites, setVisitedSites] = useState<VisitedSite[]>([]);
  /** Reader "Ask AI" summary chat. */
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [currentPageText, setCurrentPageText] = useState('');

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
    translationSplit: display.translationSplit,
    resetKey: title || null,
    initialAnchor,
    onAnchorChange: handleAnchorChange,
    onBlockChange: setCurrentBlockIndex,
    // Lazy (estimated) pagination — the first page renders after measuring a
    // small window of blocks instead of the whole document (the old all-at-
    // once measure kept the spinner up for the entire page on long articles;
    // the EPUB reader already works this way). Page count becomes an estimate.
    estimate: true,
  });

  const tocSearch = useReaderTocSearch({
    blocks: pagination.blocks,
    goToBlock: pagination.goToBlock,
    currentBlockIndex,
  });

  const handleLoad = useCallback(async (loadUrl?: string) => {
    const targetUrl = loadUrl || url;
    if (!targetUrl.trim()) return;

    // Per-phase timing so a slow load can be attributed: proxy fetch →
    // HTML→markdown → parse → first page (the reader logs its own phases).
    const t0 = Date.now();
    setLoading(true);
    setError(null);

    try {
      // Fetch + convert through the shared reader pipeline (same as web).
      const raw = await fetchReaderPage(targetUrl, PYTHON_API_URL);
      const tFetch = Date.now();
      log(`[WebReader] ⏱️ fetch ${tFetch - t0}ms bytes=${raw.length} url=${targetUrl}`);
      const md = htmlToMarkdown(raw, targetUrl);
      const tConvert = Date.now();
      log(`[WebReader] ⏱️ htmlToMarkdown ${tConvert - tFetch}ms mdChars=${md.length}`);
      // Fall back to the first h1, then the raw URL (same as web).
      const titleMatch = md.match(/^#\s+(.+)$/m);
      const extractedTitle = extractTitle(raw) || titleMatch?.[1]?.trim() || targetUrl;
      setTitle(extractedTitle);
      setText(md);
      setUrl(targetUrl);
      log(`[WebReader] ⏱️ state set ${Date.now() - tConvert}ms — total ${Date.now() - t0}ms (pagination + first render follow)`);
      // Load saved anchor for this URL
      const savedAnchor = await getUrlAnchor(targetUrl);
      setInitialAnchor(savedAnchor);
      // Track the visit (SPEC-049 §10.3)
      recordVisit(targetUrl, extractedTitle).then(setVisitedSites);
    } catch (e: any) {
      log(`[WebReader] ⏱️ fetch FAILED after ${Date.now() - t0}ms:`, e?.message ?? e);
      setError(localizedError(t, e, 'msg.failed_to_load_url'));
    } finally {
      setLoading(false);
    }
  }, [url, t]);

  // Deep links can pass ?url=... (SPEC-069) — load it on mount.
  useEffect(() => {
    if (typeof urlParam === 'string' && urlParam.trim()) {
      handleLoad(urlParam.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Open a link (possibly relative) inside the web reader itself. */
  const handleOpenLinkInReader = useCallback((href: string) => {
    let resolved = href;
    try {
      resolved = new URL(href, url).href;
    } catch { /* keep raw href */ }
    void handleLoad(resolved);
  }, [handleLoad, url]);

  return (
    <PageContainer maxWidth="7xl">
      <OfflineFeatureNotice />
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
                <Button
                  onPress={handleHome}
                  variant="ghost"
                  size="icon"
                  accessibilityLabel={t('title.web_reader')}
                >
                  <Home size={18} color={ICON_MUTED} />
                </Button>
              )}
              <Button
                onPress={toggle}
                variant="ghost"
                size="icon"
                accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
                accessibilityRole="button"
              >
                {isWide && sidebarOpen ? (
                  <PanelRightClose size={18} color={ICON_MUTED} />
                ) : (
                  <PanelRightOpen size={18} color={ICON_MUTED} />
                )}
              </Button>
            </View>

            {/* ── URL input ── */}
            <View className="px-4 mb-4">
              <View className="flex-row gap-2">
                <Input
                  className="flex-1"
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
                <Button
                  onPress={() => handleLoad()}
                  disabled={!url.trim() || loading}
                  variant="default"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={ICON_MUTED} />
                  ) : (
                    <Text className={buttonTextClass('default')}>
                      {t('action.load')}
                    </Text>
                  )}
                </Button>
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
                  isTranslating={pagination.isTranslating}
                  prevPage={pagination.prevPage}
                  nextPage={pagination.nextPage}
                  goToPage={pagination.goToPage}
                  handleMeasureBlock={pagination.handleMeasureBlock}
                  onVisibleBlocksChange={pagination.onVisibleBlocksChange}
                  contentWidth={pagination.contentWidth}
                  l2Code={l2Lang.code}
                  l1Code={l1Lang.code}
                  showTranslation={display.translation}
                  onToggleTranslation={() => updateDisplay({ translation: !display.translation })}
                  showTextActions
                  translationSideBySide={isMd}
                  selectionDictionary
                  onOpenLink={handleOpenLinkInReader}
                  onOpenToc={tocSearch.headings.length > 0 ? tocSearch.openToc : undefined}
                  onOpenSearch={tocSearch.openSearch}
                  onOpenAskAi={() => setAskAiOpen(true)}
                  onPageTextChange={setCurrentPageText}
                  highlight={tocSearch.highlight}
                  // Saved words carry the page <title> (web parity:
                  // apps/web web-reader passes `title || 'Web Reader'`).
                  ctx={{ textTitle: title || t('title.web_reader') }}
                  t={t}
                />
              </View>
            )}

            {/* ── Loading state: spinner only until the first content is
                ready (with lazy pagination the estimated first page renders
                as soon as a small block window is measured) ── */}
            {loading && !text && (
              <View className="flex-1 items-center justify-center py-16">
                <ActivityIndicator size="large" color={ICON_MUTED} />
              </View>
            )}

            {/* ── Empty state: suggestions only (web parity — no hero block;
                the curated reading cards fill the space). Visited sites live
                in the sidebar. ── */}
            {!text && !loading && (
              <View className="flex-1 px-4 py-6">
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

      {/* ── Heading TOC + Search modals (web reader; SPEC-087 §8) ── */}
      <ReaderTocSearchOverlays
        headings={tocSearch.headings}
        tocOpen={tocSearch.tocOpen}
        onTocClose={() => tocSearch.setTocOpen(false)}
        onTocSelect={tocSearch.handleTocSelect}
        searchOpen={tocSearch.searchOpen}
        onSearchClose={() => tocSearch.setSearchOpen(false)}
        onSearchSelect={tocSearch.handleSearchSelect}
        blocks={pagination.blocks}
        activeIndex={currentBlockIndex}
        searchQuery={tocSearch.searchQuery}
        searchNonce={tocSearch.searchNonce}
      />

      {/* ── "Ask AI" summary chat (auto-summarize current page + text presets) ── */}
      <ReaderAskAiSheet
        open={askAiOpen}
        onClose={() => setAskAiOpen(false)}
        title={title || t('title.web_reader')}
        presets={READER_ASK_AI_TEXT_PRESETS}
        content={
          {
            text: truncateReaderAiContent(text),
            page: truncateReaderAiContent(currentPageText),
            chapter: null,
            bookUpToChapter: null,
          } satisfies ReaderAiContent
        }
        onQuotePress={tocSearch.openSearchFor}
      />
    </PageContainer>
  );
}

/**
 * Curated reading suggestions for the current L2 (SPEC-049 §10.1), grouped by
 * category, rendered as tappable button cards (web parity). Uses the shared
 * getReadingSuggestions() + READING_CATEGORIES so category order and titles
 * (`title.{category}`) match the web reader exactly.
 */
function ReadingSuggestionsList({ l2Code, onLoad }: { l2Code: string; onLoad: (url: string) => void }) {
  const t = useT();
  const suggestions = getReadingSuggestions(l2Code.split('-')[0]);
  if (!suggestions) return null;

  return (
    <View>
      <Text className="mb-3 text-sm font-semibold text-muted-foreground">
        {t('title.suggested_reading')}
      </Text>
      {READING_CATEGORIES.map((category) => {
        const items = suggestions[category];
        if (!items || items.length === 0) return null;
        return (
          <View key={category} className="mb-5">
            <Text className="mb-2 text-sm font-semibold text-foreground">
              {t(`title.${category}` as any)}
            </Text>
            {/* Wrap grid of bordered button cards — mirrors the web reader's
                `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` card grid. */}
            <View className="flex-row flex-wrap gap-2">
              {items.map((item) => {
                const favicon = faviconUrl(item.url);
                return (
                  <Pressable
                    key={item.url}
                    onPress={() => onLoad(item.url)}
                    style={{ flexBasis: '48%', flexGrow: 1 }}
                    className="min-w-0 flex-row items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 active:bg-muted"
                  >
                    {favicon ? (
                      <Image
                        source={{ uri: favicon }}
                        style={{ width: 16, height: 16, borderRadius: 2 }}
                      />
                    ) : null}
                    <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                      {item.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
