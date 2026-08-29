import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Modal, Animated, ScrollView, useWindowDimensions, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEpub } from '@/hooks/use-epub';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { EpubSearchPanel } from '@/components/reader/EpubSearchPanel';
import { EpubCover } from '@/components/reader/EpubCover';
import { EpubBookshelf } from '@/components/reader/EpubBookshelf';
import { PdfReaderPanel } from '@/components/reader/PdfReaderPanel';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { Header } from '@/components/layout/Header';
import { ReaderChromeProvider, useReaderChrome } from '@/contexts/ReaderChromeContext';
import { PanelTopOpen, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { baseCode } from '@langplayer/utils';
import { ICON_MUTED } from '@/lib/theme-colors';
import { translationLogger, log, logwarn } from '@/lib/logger';
import { isReaderTapSuppressed, suppressReaderTap } from '@/lib/reader-tap-guard';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { BookLocation, TocMarker } from '@/lib/epub-book';

/** Persist the reading location this long after the last page turn. Rapid
 *  flipping would otherwise write to disk on every single turn. */
const SAVE_LOCATION_DEBOUNCE_MS = 800;

export default function EpubReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const epub = useEpub();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setImmersed, registerCloseReader } = useReaderChrome();
  // Reader translation goes side-by-side from md (>=768px) — portrait iPads.
  const { isMd } = useResponsive();

  /** Top strip reserved for the app-header chrome + the muted chapter title:
   *  header (insets.top + 57) + 8 clearance + 16 title line + 8 breathing
   *  room (SPEC-085 §6.2) — the dropped-down header never obscures content. */
  const TOP_CHROME_RESERVE = insets.top + 89;
  /** Bottom strip reserved for the pagination-bar chrome + the muted page
   *  count: bar (27 + insets.bottom) + 8 clearance + 16 counter line + 8
   *  breathing room (SPEC-085 §6.2) — the bottom bar never covers the counter. */
  const BOTTOM_CHROME_RESERVE = 59 + insets.bottom;

  const [openingId, setOpeningId] = useState<string | null>(null);
  /** Synchronous open guard — the `openingId` STATE is stale in the render
   *  closure, so a tap landing before the state commit (or the mount-time
   *  auto-open racing a manual tap) would launch two concurrent opens, and the
   *  losing one's error path kicks the reader back to the bookshelf. A ref is
   *  set before the state update closes that window (web parity). */
  const openingIdRef = useRef<string | null>(null);
  const [location, setLocation] = useState<BookLocation | null>(null);
  const [seekBlock, setSeekBlock] = useState<number | null>(null);
  /** Active search-match highlight (block + char range), if any. */
  const [highlight, setHighlight] = useState<{ blockIndex: number; start: number; end: number } | null>(null);
  /** Immersive reader chrome: hidden by default, toggled by tapping blank space. */
  const [chromeVisible, setChromeVisible] = useState(false);
  /** TOC and Search are modals now (the sidebar is gone). */
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const locationRef = useRef<BookLocation | null>(null);
  const historyRef = useRef<BookLocation[]>([]);
  const pendingJumpRef = useRef<BookLocation | null>(null);
  const saveLocationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Auto-open the last-read book once per mount (returning to the epub
   *  screen resumes reading instead of landing on the bookshelf). An explicit
   *  Close keeps the shelf for the rest of this session. */
  const autoOpenedRef = useRef(false);

  useEffect(() => { locationRef.current = location; }, [location]);

  /** Persist the current position — debounced so rapid flipping doesn't write
   *  the location to disk on every turn. Flushed on close/unmount. */
  const flushSaveLocation = useCallback(() => {
    if (saveLocationTimerRef.current) {
      clearTimeout(saveLocationTimerRef.current);
      saveLocationTimerRef.current = null;
      const cur = locationRef.current;
      if (cur) void epub.saveLocation(cur);
    }
  }, [epub]);

  // Flush any pending save when the screen unmounts (tab switch).
  useEffect(() => {
    return () => {
      flushSaveLocation();
    };
  }, [flushSaveLocation]);

  const hasBook = epub.openBookId != null;

  const pagination = useEpubPagination({
    text: '',
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    translationSplit: display.translationSplit,
    resetKey: epub.openBookId,
    preParsedBlocks: epub.blocks,
    initialBlockIndex: seekBlock,
    onBlockChange: useCallback((blockIndex: number) => {
      const loc: BookLocation = { blockIndex, offset: 0 };
      setLocation(loc);
      // Debounce persistence: rapid page flipping would otherwise write the
      // reading location to disk on every turn. Flushed on close/unmount.
      if (saveLocationTimerRef.current) clearTimeout(saveLocationTimerRef.current);
      saveLocationTimerRef.current = setTimeout(() => {
        saveLocationTimerRef.current = null;
        void epub.saveLocation(loc);
      }, SAVE_LOCATION_DEBOUNCE_MS);
    }, [epub]),
    estimate: true,
    // The reader fills the screen with the top/bottom chrome strips reserved
    // as padding — the paginator measures against the true remaining height
    // (viewportReserve only seeds the pre-layout fallback).
    viewportReserve: { top: TOP_CHROME_RESERVE, bottom: BOTTOM_CHROME_RESERVE },
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
    // Ref guard (not just the `openingId` state) so a tap racing the
    // mount-time auto-open can't launch two concurrent opens (web parity).
    if (openingIdRef.current) {
      log('[epub] handleOpenBook ignored — a book is already opening', { id, openingIdRef: openingIdRef.current });
      return;
    }
    openingIdRef.current = id;
    setOpeningId(id);
    setLocation(null);
    historyRef.current = [];
    log('[epub] handleOpenBook start', { id, label: epub.books.find((b) => b.id === id)?.fileName ?? null });
    try {
      const start = await epub.openBook(id, { skipCover: true });
      log('[epub] handleOpenBook finish', { id, gotStart: Boolean(start) });
      if (start) setLocation(start);
    } finally {
      openingIdRef.current = null;
      setOpeningId(null);
    }
  }, [epub]);

  // Auto-open the last-read book in the current L2 once the shelf is ready —
  // returning to the epub screen resumes reading instead of showing the
  // bookshelf. Same language filter as the bookshelf (legacy untagged books
  // count everywhere); opens straight to content like a card tap. Fires once
  // per mount so an explicit Close keeps the shelf for this session.
  useEffect(() => {
    if (autoOpenedRef.current || !epub.ready || epub.openBookId != null) return;
    autoOpenedRef.current = true;
    const l2Primary = baseCode(l2Lang.code);
    const last = [...epub.books]
      .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
      .find((b) => !b.language || baseCode(b.language) === l2Primary);
    log('[epub] auto-open (keep book open on return)', {
      ready: epub.ready,
      openBookId: epub.openBookId,
      lastId: last?.id ?? null,
      lastLabel: last?.fileName ?? null,
      books: epub.books.length,
    });
    if (last) void handleOpenBook(last.id);
  }, [epub.ready, epub.books, epub.openBookId, l2Lang.code, handleOpenBook]);

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
    log('[epub] handleClose (book close / return to bookshelf)', { openBookId: epub.openBookId });
    flushSaveLocation(); // persist the final position before the book closes
    setLocation(null);
    historyRef.current = [];
    setChromeVisible(false);
    setTocOpen(false);
    setSearchOpen(false);
    setHighlight(null);
    await epub.close();
  }, [epub, flushSaveLocation]);

  // Close button (top-right X in the immersive reader).
  const handleCloseReader = useCallback(() => {
    void handleClose();
  }, [handleClose]);

  // Register the book's close handler so the nav menu's "Epub Reader" item can
  // close it (an alternative to the close button) when the reader is already
  // open — the NavBar/drawer call requestCloseReader on a same-route tap.
  //
  // Register a STABLE handler backed by a ref: `handleClose` depends on the
  // freshly-created `useEpub()` object, so it changes identity every render.
  // Depending on it here (a) re-registers on every render and (b) each
  // `registerCloseReader(fn)` calls `setCloseReader(fn)` in ReaderChromeProvider
  // — both drive an unbounded re-render loop between the reader screen and the
  // provider (the "Cannot update EpubReaderScreen while rendering
  // ReaderChromeProvider" error), which is what caused the reader to be torn
  // down to the bookshelf. Register once on mount with a stable close wrapper
  // that reads the latest handler from a ref.
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  useEffect(() => {
    registerCloseReader(() => { void handleCloseRef.current(); });
    return () => registerCloseReader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCloseReader]);

  const handleChapterSelect = useCallback((href: string) => {
    setTocOpen(false);
    setHighlight(null);
    pushHistory();
    void epub.resolveHref(href).then(jumpToBlock);
  }, [epub, pushHistory, jumpToBlock]);

  const handleSearchSelect = useCallback((match: { blockIndex: number; start: number; end: number }) => {
    setSearchOpen(false);
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

  // The book reader is active — the final render path after the bookshelf,
  // opening, error and cover screens.
  const readerActive = hasBook
    && !openingId
    && !(epub.loading && !epub.coverTapped)
    && !epub.error
    && epub.coverTapped;

  // Immerse while the book reader is open — the global app header hides so the
  // book fills the screen; the reader renders its own chrome as overlays.
  // Reset on blur so switching tabs restores the normal chrome.
  useFocusEffect(
    useCallback(() => {
      setImmersed(readerActive);
      return () => setImmersed(false);
    }, [readerActive, setImmersed]),
  );

  // Reset the overlay chrome whenever the reader is not active.
  useEffect(() => {
    if (!readerActive) {
      setChromeVisible(false);
      setTocOpen(false);
      setSearchOpen(false);
    }
  }, [readerActive]);

  // ── Immersive chrome animations: the app header slides down from the top
  // when the chrome is shown (pure overlay, no reflow). The chromeless
  // controls (show toolbars + close) simply render when the chrome is hidden. ──
  const topChromeTranslateY = useRef(new Animated.Value(-160)).current;
  useEffect(() => {
    Animated.timing(topChromeTranslateY, {
      toValue: chromeVisible ? 0 : -160,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, topChromeTranslateY]);

  // Blank-space tap in the reader toggles the immersive chrome. Quitting a
  // dialog must never toggle it: the tap that dismissed the dialog can land
  // on the tap surface right after the overlay disappears (reader-tap-guard),
  // so ignore taps inside the suppression window.
  const toggleChrome = useCallback(() => {
    if (isReaderTapSuppressed()) {
      log('[epub] blank-tap ignored — dialog recently closed (chrome guard)');
      return;
    }
    setChromeVisible(v => !v);
  }, []);

  // ── PDF reader (a format:'pdf' entry is open) ──
  if (epub.pdfDoc) {
    return (
      <PdfReaderPanel
        uri={epub.pdfDoc.uri}
        fileName={epub.pdfDoc.fileName}
        onClose={() => void handleClose()}
      />
    );
  }

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
          <Button onPress={handleClose} variant="ghost" size="icon">
            <X size={18} color={ICON_MUTED} />
          </Button>
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
          flipping={pagination.flipping}
          measuring={pagination.measuring}
          lazyPagination
          l2Code={l2Lang.code}
          l1Code={l1Lang.code}
          showTranslation={display.translation}
          onToggleTranslation={() => {
            const next = !display.translation;
            translationLogger.log(`toggle translation → ${next ? 'on' : 'off'}`);
            updateDisplay({ translation: next });
          }}
          showTextActions
          translationSideBySide={isMd}
          hideSplitHandle
          selectionDictionary
          firstLineIndent
          onOpenLink={handleOpenLink}
          highlight={highlight}
          textScale={1}
          t={t}
          immersive
          immersiveReserve={{ top: TOP_CHROME_RESERVE, bottom: BOTTOM_CHROME_RESERVE }}
          chromeVisible={chromeVisible}
          onToggleChrome={toggleChrome}
          onOpenToc={epub.toc.length > 0 ? () => setTocOpen(true) : undefined}
          onOpenSearch={() => setSearchOpen(true)}
          topOverlay={
            <Text
              className="max-w-[85%] text-xs text-muted-foreground"
              numberOfLines={1}
            >
              {nearestMarker?.label || epub.fileName || t('title.epub_reader')}
            </Text>
          }
          pageInfoOverlay={(page, total) => (
            <Text className="text-xs text-muted-foreground">{page} / {total}</Text>
          )}
        />
      </View>

      {/* Top chrome: the app header (logo, cloud, search…) — hidden by
          default, slides down when the chrome is shown. */}
      <Animated.View
        pointerEvents={chromeVisible ? 'auto' : 'none'}
        className="absolute inset-x-0 top-0 z-30"
        style={{ transform: [{ translateY: topChromeTranslateY }] }}
      >
        <ReaderChromeProvider immersed={false}>
          <Header />
        </ReaderChromeProvider>
      </Animated.View>

      {/* Chromeless controls: when the chrome is hidden, two icon-only
          buttons sit top right, vertically aligned with the chapter title
          (top = insets.top + 65, the title line box) — "show toolbars"
          reveals the chrome and "close" leaves the reader. Chrome-visible
          mode deliberately has NO close button (the escape hatches are the
          chromeless close and the nav menu). */}
      {!chromeVisible && (
        <View
          className="absolute z-40 flex-row items-center gap-2"
          style={{ top: insets.top + 65, right: 12 }}
        >
          <Pressable
            onPress={toggleChrome}
            className="h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={t('action.show_toolbars')}
          >
            <PanelTopOpen size={14} color={ICON_MUTED} />
          </Pressable>
          <Pressable
            onPress={handleCloseReader}
            className="h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={t('action.close')}
          >
            <X size={14} color={ICON_MUTED} />
          </Pressable>
        </View>
      )}

      {/* ── TOC modal (replaces the sidebar) ── */}
      {epub.toc.length > 0 && (
        <Modal
          visible={tocOpen}
          transparent
          animationType="fade"
          onRequestClose={() => { suppressReaderTap(); setTocOpen(false); }}
        >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="max-h-[85%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
              <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
                {t('title.chapters')}
              </Text>
              <Button
                onPress={() => jumpToMarker(markerNav.prev)}
                disabled={!markerNav.prev}
                variant="ghost"
                size="sm"
                accessibilityLabel={t('action.previous_chapter')}
              >
                <ChevronLeft size={16} color={ICON_MUTED} />
                <Text className="text-xs font-medium text-primary">{t('action.previous_chapter')}</Text>
              </Button>
              <Button
                onPress={() => jumpToMarker(markerNav.next)}
                disabled={!markerNav.next}
                variant="ghost"
                size="sm"
                accessibilityLabel={t('action.next_chapter')}
              >
                <Text className="text-xs font-medium text-primary">{t('action.next_chapter')}</Text>
                <ChevronRight size={16} color={ICON_MUTED} />
              </Button>
              <Pressable
                onPress={() => { suppressReaderTap(); setTocOpen(false); }}
                className="rounded p-1 active:bg-muted"
                accessibilityLabel={t('action.close')}
              >
                <X size={18} color={ICON_MUTED} />
              </Pressable>
            </View>
            <ScrollView className="max-h-[70%]" keyboardShouldPersistTaps="handled">
              <EpubChapterSidebar
                toc={epub.toc}
                chapterHref={nearestMarker?.href ?? null}
                onSelect={handleChapterSelect}
              />
            </ScrollView>
            {/* Chapter count footer — web parity (SPEC-085 §10). */}
            <View className="border-t border-border px-4 py-2">
              <Text className="text-xs text-muted-foreground">
                {(epub.markers?.length ?? epub.toc.length)} {t('msg.chapters')}
              </Text>
            </View>
          </View>
        </View>
        </Modal>
      )}

      {/* ── Search modal (replaces the sidebar) ── */}
      {/* Fixed height, independent of the result count (SPEC-085 §9): the
          search bar stays pinned at the top and the results area reserves
          its space even when empty, so the bar sits well above the software
          keyboard; the KeyboardAvoidingView shifts the modal up when the
          keyboard opens. */}
      <Modal
        visible={searchOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { suppressReaderTap(); setSearchOpen(false); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <View className="h-[70%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
                <Text className="flex-1 text-base font-semibold text-foreground">{t('action.search')}</Text>
                <Pressable
                  onPress={() => { suppressReaderTap(); setSearchOpen(false); }}
                  className="rounded p-1 active:bg-muted"
                  accessibilityLabel={t('action.close')}
                >
                  <X size={18} color={ICON_MUTED} />
                </Pressable>
              </View>
              <View className="flex-1">
                <EpubSearchPanel
                  blocks={pagination.blocks}
                  chapterLabels={epub.chapterLabels}
                  onSelect={handleSearchSelect}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
