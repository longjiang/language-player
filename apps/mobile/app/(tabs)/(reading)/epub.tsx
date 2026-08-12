import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions, Linking } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpub } from '@/hooks/use-epub';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { EpubSearchPanel } from '@/components/reader/EpubSearchPanel';
import { EpubCover } from '@/components/reader/EpubCover';
import { EpubBookshelf } from '@/components/reader/EpubBookshelf';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { TabbedPanel } from '@/components/TabbedPanel';
import { ArrowLeft, X, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose, List, Search } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { translationLogger } from '@/lib/logger';
import type { BookLocation, TocMarker } from '@/lib/epub-book';

export default function EpubReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const epub = useEpub();
  const { height: windowHeight } = useWindowDimensions();
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [location, setLocation] = useState<BookLocation | null>(null);
  const [seekBlock, setSeekBlock] = useState<number | null>(null);
  /** Active search-match highlight (block + char range), if any. */
  const [highlight, setHighlight] = useState<{ blockIndex: number; start: number; end: number } | null>(null);
  const locationRef = useRef<BookLocation | null>(null);
  const historyRef = useRef<BookLocation[]>([]);
  const pendingJumpRef = useRef<BookLocation | null>(null);

  useEffect(() => { locationRef.current = location; }, [location]);

  const hasBook = epub.openBookId != null;

  const pagination = useEpubPagination({
    text: '',
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    resetKey: epub.openBookId,
    preParsedBlocks: epub.blocks,
    initialBlockIndex: seekBlock,
    onBlockChange: useCallback((blockIndex: number) => {
      const loc: BookLocation = { blockIndex, offset: 0 };
      setLocation(loc);
      void epub.saveLocation(loc);
    }, [epub]),
    estimate: true,
  });

  // Seek to the resume location once the reader enters content (cover tap or
  // straight-to-content bookshelf open).
  useEffect(() => {
    if (!epub.openBookId) { setSeekBlock(null); return; }
    setSeekBlock(epub.coverTapped ? (epub.initialLocation?.blockIndex ?? null) : null);
  }, [epub.openBookId, epub.coverTapped, epub.initialLocation]);

  // ── Navigation ──
  const pushHistory = useCallback(() => {
    const cur = locationRef.current;
    if (!cur) return;
    const stack = historyRef.current;
    const last = stack[stack.length - 1];
    if (last && last.blockIndex === cur.blockIndex) return;
    historyRef.current = [...stack, cur].slice(-50);
  }, []);

  // Stable refs to the epub/pagination objects so callbacks passed down to
  // every reader token (onOpenLink) keep a stable identity. The hook returns
  // a fresh object each render; depending on it directly made onOpenLink a new
  // function every render, defeating TokenizedText's memoization and forcing
  // the whole reader page to re-render on every scroll/sync update.
  const epubRef = useRef(epub);
  epubRef.current = epub;
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;

  const jumpToBlock = useCallback((loc: BookLocation | null) => {
    if (!loc) return;
    pendingJumpRef.current = loc;
    const p = paginationRef.current;
    if (p.hasMeasured) {
      pendingJumpRef.current = null;
      p.goToBlock(loc.blockIndex);
    }
    setLocation(loc);
  }, []);

  // Apply a jump queued while whole-book measurement was still running.
  useEffect(() => {
    if (!pagination.hasMeasured || !pendingJumpRef.current) return;
    const loc = pendingJumpRef.current;
    pendingJumpRef.current = null;
    pagination.goToBlock(loc.blockIndex);
  }, [pagination.hasMeasured, pagination]);

  const jumpToMarker = useCallback((marker: TocMarker | null) => {
    if (!marker) return;
    pushHistory();
    jumpToBlock(marker.location);
  }, [pushHistory, jumpToBlock]);

  const handleOpenBook = useCallback(async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    setLocation(null);
    historyRef.current = [];
    try {
      const start = await epub.openBook(id, { skipCover: true });
      if (start) setLocation(start);
    } finally {
      setOpeningId(null);
    }
  }, [epub, openingId]);

  const handleAddBook = useCallback(async () => {
    setLocation(null);
    historyRef.current = [];
    await epub.pickFile(l2Lang.code);
  }, [epub, l2Lang.code]);

  const handleCoverOpen = useCallback(() => {
    epub.dismissCover();
    if (epub.initialLocation) setLocation(epub.initialLocation);
  }, [epub]);

  const handleClose = useCallback(async () => {
    setLocation(null);
    historyRef.current = [];
    setMobileOpen(false);
    setHighlight(null);
    await epub.close();
  }, [epub]);

  const handleBack = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) {
      setMobileOpen(false);
      setHighlight(null);
      jumpToBlock(prev);
    } else {
      void handleClose();
    }
  }, [jumpToBlock, handleClose]);

  const handleChapterSelect = useCallback((href: string) => {
    setMobileOpen(false);
    setHighlight(null);
    pushHistory();
    void epub.resolveHref(href).then(jumpToBlock);
  }, [epub, pushHistory, jumpToBlock]);

  const handleSearchSelect = useCallback((match: { blockIndex: number; start: number; end: number }) => {
    setMobileOpen(false);
    setHighlight(match);
    pushHistory();
    jumpToBlock({ blockIndex: match.blockIndex, offset: match.start });
  }, [pushHistory, jumpToBlock]);

  const handleOpenLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href)) {
      Linking.openURL(href).catch(() => {});
      return;
    }
    if (!href || href === '#') return;
    const e = epubRef.current;
    const cur = locationRef.current;
    const block = cur ? e.blocks?.[cur.blockIndex] : undefined;
    const fromHref = block && block.kind === 'text'
      ? e.spineHrefs[block.spineIndex ?? 0]
      : undefined;
    pushHistory();
    void e.resolveHref(href, fromHref).then(jumpToBlock);
  }, [pushHistory, jumpToBlock]);

  const handleRemoveBook = useCallback((id: string) => {
    void epub.removeBook(id);
  }, [epub]);

  // ── Header metadata ──
  const nearestMarker = useMemo(() => {
    if (!location || epub.markers.length === 0) return null;
    let best: TocMarker | null = null;
    for (const m of epub.markers) {
      if (m.location.blockIndex <= location.blockIndex) best = m;
      else break;
    }
    return best;
  }, [location, epub.markers]);

  const markerNav = useMemo(() => {
    if (!location || epub.markers.length === 0) {
      return { prev: null as TocMarker | null, next: null as TocMarker | null };
    }
    const idx = epub.markers.findIndex((m) => m.location.blockIndex >= location.blockIndex);
    const currentIdx = idx === -1
      ? epub.markers.length - 1
      : (epub.markers[idx]!.location.blockIndex === location.blockIndex ? idx : idx - 1);
    return {
      prev: currentIdx > 0 ? epub.markers[currentIdx - 1] ?? null : null,
      next: currentIdx >= 0 && currentIdx < epub.markers.length - 1
        ? epub.markers[currentIdx + 1] ?? null
        : null,
    };
  }, [location, epub.markers]);

  const errorText = epub.error ? t('msg.epub_parse_error') : null;

  // ── Bookshelf (no book open) ──
  if (!hasBook) {
    if (!epub.ready || (epub.loading && !epub.error)) {
      return (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator size="large" color={ICON_MUTED} />
        </View>
      );
    }
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5">
          <Text className="text-xl font-bold text-foreground">{t('title.epub_reader')}</Text>
        </View>
        <EpubBookshelf
          books={epub.books}
          l2Code={l2Lang.code}
          l2Name={l2Lang.name}
          openingId={openingId}
          error={errorText}
          onOpenBook={handleOpenBook}
          onRemoveBook={handleRemoveBook}
          onAddBook={handleAddBook}
        />
      </View>
    );
  }

  // ── Opening ──
  if (openingId || (epub.loading && !epub.coverTapped)) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (epub.error) {
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{epub.fileName}</Text>
          <Pressable onPress={handleClose} className="rounded p-1 active:bg-muted">
            <X size={18} color={ICON_MUTED} />
          </Pressable>
        </View>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{errorText}</Text>
        </View>
      </View>
    );
  }

  // ── Cover (new imports) ──
  if (!epub.coverTapped) {
    return (
      <EpubCover
        fileName={epub.fileName}
        epubTitle={epub.epubTitle}
        epubAuthor={epub.epubAuthor}
        coverUrl={epub.coverUrl}
        onClose={handleClose}
        onOpen={handleCoverOpen}
        windowHeight={windowHeight}
        t={t}
      />
    );
  }

  // ── Reader ──
  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5 flex-row items-center gap-3">
        <Pressable onPress={handleBack} className="rounded p-1 active:bg-muted" accessibilityLabel={t('action.back')}>
          <ArrowLeft size={18} color={ICON_MUTED} />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
            {nearestMarker?.label || epub.fileName || t('title.epub_reader')}
          </Text>
          <Text className="text-xs text-muted-foreground">{l2Lang.name} → {l1Lang.name}</Text>
        </View>
        <Pressable onPress={handleClose} className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted">
          <X size={14} color={ICON_MUTED} /><Text className="text-xs text-muted-foreground">{t('action.close')}</Text>
        </Pressable>
        <Pressable
          onPress={toggle}
          className="rounded p-1 active:bg-muted"
          accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
        >
          {isWide && sidebarOpen ? (
            <PanelRightClose size={20} color={ICON_MUTED} />
          ) : (
            <PanelRightOpen size={20} color={ICON_MUTED} />
          )}
        </Pressable>
      </View>

      <View className="flex-1 pt-2" style={{ flexDirection: isWide ? 'row' : 'column' }}>
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
            measureStart={pagination.measureStart}
            measureEnd={pagination.measureEnd}
            measureNonce={pagination.measureNonce}
            onViewportLayout={pagination.handleViewportLayout}
            hasPrev={pagination.hasPrev}
            hasNext={pagination.hasNext}
            l2Code={l2Lang.code}
            l1Code={l1Lang.code}
            showTranslation={display.translation}
            onToggleTranslation={() => {
              const next = !display.translation;
              translationLogger.log(`toggle translation → ${next ? 'on' : 'off'}`);
              updateDisplay({ translation: next });
            }}
            showTextActions
            translationSideBySide={isWide}
            onOpenLink={handleOpenLink}
            highlight={highlight}
            textScale={1}
            t={t}
          />
        </View>

        {/* Sidebar — shared panel + sheet with chapters/search tabs (web parity) */}
        <Sidebar
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sidebarOpen={sidebarOpen}
          title={t('title.epub_reader')}
          desktopClassName="w-64 ml-3"
          headerActions={
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => jumpToMarker(markerNav.prev)}
                disabled={!markerNav.prev}
                className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted disabled:opacity-30"
                accessibilityLabel={t('action.previous_chapter')}
              >
                <ChevronLeft size={16} color={ICON_MUTED} />
                <Text className="text-xs text-muted-foreground">{t('action.previous_chapter')}</Text>
              </Pressable>
              <Pressable
                onPress={() => jumpToMarker(markerNav.next)}
                disabled={!markerNav.next}
                className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted disabled:opacity-30"
                accessibilityLabel={t('action.next_chapter')}
              >
                <Text className="text-xs text-muted-foreground">{t('action.next_chapter')}</Text>
                <ChevronRight size={16} color={ICON_MUTED} />
              </Pressable>
            </View>
          }
          footer={
            <Text className="px-3 py-2 text-xs text-muted-foreground">
              {epub.markers.length} {t('msg.chapters')}
            </Text>
          }
        >
          <TabbedPanel
            tabs={[
              { key: 'chapters', label: t('title.chapters'), icon: () => <List size={14} color={ICON_MUTED} /> },
              { key: 'search', label: t('action.search'), icon: () => <Search size={14} color={ICON_MUTED} /> },
            ]}
            defaultTab="chapters"
            className="h-full"
            contentClassName="min-h-0"
          >
            <EpubChapterSidebar
              toc={epub.toc}
              chapterHref={nearestMarker?.href ?? null}
              onSelect={handleChapterSelect}
            />
            <EpubSearchPanel
              blocks={pagination.blocks}
              chapterLabels={epub.chapterLabels}
              onSelect={handleSearchSelect}
            />
          </TabbedPanel>
        </Sidebar>
      </View>
    </View>
  );
}
