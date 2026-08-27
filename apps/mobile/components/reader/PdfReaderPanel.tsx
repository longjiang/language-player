import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button } from '@/components/ui/button';
import { PdfViewer, type PdfViewerHandle, type PdfViewerInfo, type PdfOutlineItem } from '@/lib/pdf-viewer';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { ZoomableImage } from '@/components/reader/ZoomableImage';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { PanelRightClose, PanelRightOpen, X } from 'lucide-react-native';
import { downscaleImage } from '@/lib/downscale-image';
import { log, logwarn } from '@/lib/logger';

/**
 * Mobile PDF reader (format: 'pdf' shelf entries):
 *  - open → auto-opens page 1 in the paginated reader (converted via Vision)
 *    with a collapsible right **thumbnails sidebar** (standard Sidebar);
 *  - the sidebar lists every page, outlines the current page, tapping a
 *    different page opens it, tapping the current page opens a full-size
 *    preview modal (zoomable, like the image reader);
 *  - the bottom bar's Thumbnails button toggles the sidebar.
 */
export function PdfReaderPanel({
  uri,
  fileName,
  onClose,
}: {
  uri: string;
  fileName: string;
  onClose: () => void;
}) {
  const t = useT();
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const { isMd } = useResponsive();
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();

  const viewerRef = useRef<PdfViewerHandle>(null);
  const [info, setInfo] = useState<PdfViewerInfo | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  /** Reading session: the page being read + its AI-converted markdown. */
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertedMd, setConvertedMd] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  /** Page whose full-size preview modal is open (the current page). */
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const pdfPagination = useEpubPagination({
    text: currentPage !== null ? convertedMd : '',
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    translationSplit: display.translationSplit,
    resetKey: currentPage !== null ? `pdf-${currentPage}` : null,
    estimate: true,
  });

  const pageCount = info?.pageCount ?? 0;

  // Pre-render the first few thumbnails once the document is ready.
  useEffect(() => {
    if (!info) return;
    for (let i = 1; i <= Math.min(info.pageCount, 6); i++) {
      void viewerRef.current?.renderPage(i, 0.5).then((url) => {
        if (url) setThumbs((prev) => (prev[i] ? prev : { ...prev, [i]: url }));
      });
    }
  }, [info]);

  const renderThumb = useCallback((page: number) => {
    if (thumbs[page]) return;
    void viewerRef.current?.renderPage(page, 0.5).then((url) => {
      if (url) setThumbs((prev) => (prev[page] ? prev : { ...prev, [page]: url }));
    });
  }, [thumbs]);

  /** Tap a page: convert it to markdown via Vision, read it. */
  const openPage = useCallback(async (page: number) => {
    setCurrentPage(page);
    setConverting(true);
    setConvertedMd('');
    log('[pdf] page → vision OCR', { page });
    try {
      const img = await viewerRef.current?.renderPage(page, 1.5);
      if (!img) throw new Error('page render failed');
      // Downscale + re-encode before /vision to cap token usage.
      const payload = await downscaleImage(img);
      log('[pdf] page → vision OCR', { page, b64: `${img.length}→${payload.length}` });
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: payload,
          prompt: PDF_PAGE_PROMPT,
        }),
      });
      const data = res.ok ? await res.json() : null;
      const md = typeof data?.response === 'string' ? data.response : '';
      setConvertedMd(md);
    } catch (err) {
      logwarn('[pdf] page conversion failed:', (err as Error)?.message ?? err);
      setConvertedMd('');
    } finally {
      setConverting(false);
    }
  }, []);

  // Auto-open page 1 once the document is ready (replaces the old grid).
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (!info || didAutoOpenRef.current) return;
    didAutoOpenRef.current = true;
    void openPage(1);
  }, [info, openPage]);

  // Render the full-size page for the preview modal on demand.
  useEffect(() => {
    if (previewPage === null) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    void viewerRef.current?.renderPage(previewPage, 2).then((url) => {
      if (!cancelled && url) setPreviewUrl(url);
    });
    return () => { cancelled = true; };
  }, [previewPage]);

  const flatOutline = useMemo(() => {
    const out: { title: string; page: number; depth: number }[] = [];
    const walk = (items: PdfOutlineItem[], depth: number) => {
      for (const item of items) {
        out.push({ title: item.title, page: item.page, depth });
        if (item.children) walk(item.children, depth + 1);
      }
    };
    walk(info?.outline ?? [], 0);
    return out;
  }, [info]);

  /** A single page thumbnail tile in the sidebar (current page outlined). */
  const sidebarPage = (page: number) => (
    <Pressable
      key={page}
      onPress={() => {
        // Clicking the current page opens its full-size preview; clicking a
        // different page reads it.
        if (page === currentPage) setPreviewPage(page);
        else void openPage(page);
      }}
      className={`relative w-24 overflow-hidden rounded-lg border-2 ${page === currentPage ? 'border-primary' : 'border-border'}`}
      accessibilityRole="button"
      accessibilityLabel={t('msg.pdf_page', { page: String(page) })}
    >
      <View className="w-full overflow-hidden" style={{ aspectRatio: 3 / 4 }}>
        {thumbs[page] ? (
          <Image source={{ uri: thumbs[page] }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Text className="text-xs text-muted-foreground">{page}</Text>
          </View>
        )}
      </View>
      {page === currentPage && <View className="absolute inset-0 border-2 border-primary" />}
    </Pressable>
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header: title + sidebar toggle + close */}
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-semibold text-foreground">
          {fileName} — {t('msg.pdf_page', { page: String(currentPage ?? 1) })}
        </Text>
        <Button
          onPress={toggle}
          variant="ghost"
          size="icon"
          accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
        >
          {isWide && sidebarOpen ? (
            <PanelRightClose size={18} color={ICON_MUTED} />
          ) : (
            <PanelRightOpen size={18} color={ICON_MUTED} />
          )}
        </Button>
        <Pressable
          onPress={onClose}
          className="rounded-md p-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.close')}
        >
          <X size={18} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* Content row: main read view + right thumbnails sidebar */}
      <View className="flex-1" style={{ flexDirection: isWide ? 'row' : 'column' }}>
        <View className="flex-1">
          {currentPage === null || converting ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={ICON_MUTED} />
              <Text className="mt-3 text-sm text-muted-foreground">{t('msg.making_words_interactive')}</Text>
            </View>
          ) : (
            <PaginatedReader
              blocks={pdfPagination.blocks}
              visibleBlocks={pdfPagination.visibleBlocks}
              page={pdfPagination.page}
              totalPages={pdfPagination.totalPages}
              hasMeasured={pdfPagination.hasMeasured}
              loadingTokens={pdfPagination.loadingTokens}
              tokenCache={pdfPagination.tokenCache}
              blockTranslations={pdfPagination.blockTranslations}
              isTranslating={pdfPagination.isTranslating}
              prevPage={pdfPagination.prevPage}
              nextPage={pdfPagination.nextPage}
              goToPage={pdfPagination.goToPage}
              handleMeasureBlock={pdfPagination.handleMeasureBlock}
              onVisibleBlocksChange={pdfPagination.onVisibleBlocksChange}
              contentWidth={pdfPagination.contentWidth}
              measureStart={pdfPagination.measureStart}
              measureEnd={pdfPagination.measureEnd}
              measureNonce={pdfPagination.measureNonce}
              onViewportLayout={pdfPagination.handleViewportLayout}
              hasPrev={pdfPagination.hasPrev}
              hasNext={pdfPagination.hasNext}
              flipping={pdfPagination.flipping}
              measuring={pdfPagination.measuring}
              l2Code={l2Lang.code}
              l1Code={l1Lang.code}
              showTranslation={display.translation}
              onToggleTranslation={() => {
                const next = !display.translation;
                updateDisplay({ translation: next });
              }}
              showTextActions
              translationSideBySide={isMd}
              selectionDictionary
              firstLineIndent
              onOpenToc={flatOutline.length > 0 ? () => setTocOpen(true) : undefined}
              onOpenThumbnails={toggle}
              textScale={1}
              t={t}
            />
          )}
        </View>

        {/* Thumbnails sidebar — right, collapsible (standard Sidebar). */}
        <Sidebar
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sidebarOpen={sidebarOpen}
          title={t('action.thumbnails')}
          desktopClassName="w-60 ml-3"
        >
          <View className="flex-row flex-wrap gap-2 p-2">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(sidebarPage)}
          </View>
        </Sidebar>
      </View>

      {/* TOC dialog — the PDF outline */}
      <Modal visible={tocOpen} transparent animationType="fade" onRequestClose={() => setTocOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="max-h-[80%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="flex-1 text-base font-semibold text-foreground">{t('title.chapters')}</Text>
              <Pressable
                onPress={() => setTocOpen(false)}
                className="rounded p-1 active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('action.close')}
              >
                <X size={18} color={ICON_MUTED} />
              </Pressable>
            </View>
            <ScrollView className="max-h-[70%]">
              {flatOutline.map((item, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    setTocOpen(false);
                    void openPage(item.page);
                  }}
                  className="flex-row items-center gap-2 px-4 py-2 active:bg-muted"
                  style={{ paddingLeft: 16 + item.depth * 14 }}
                >
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-foreground">
                    {item.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{item.page}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full-size page preview — tap to zoom in/out, pinch to zoom. */}
      <Modal
        visible={previewPage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPage(null)}
      >
        <View className="flex-1 bg-black/90">
          {previewUrl ? <ZoomableImage uri={previewUrl} /> : null}
          <Pressable
            onPress={() => setPreviewPage(null)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2"
            accessibilityRole="button"
            accessibilityLabel={t('action.close')}
          >
            <X size={20} color="#fff" />
          </Pressable>
        </View>
      </Modal>

      <PdfViewer uri={uri} ref={viewerRef} onInfo={setInfo} />
    </View>
  );
}

/** Vision prompt: transcribe the page as clean, flowing markdown (no hard
 *  line breaks, natural reading order) — shared locally by openPage. */
const PDF_PAGE_PROMPT =
  'Extract all text from this PDF page image as clean, properly formatted ' +
  'markdown. Separate each block element (headings, paragraphs, list items) ' +
  'with a blank line so blocks reflow independently. Keep each paragraph as ' +
  'flowing prose — do not insert line breaks inside a paragraph, and do not ' +
  'collapse distinct paragraphs together. Preserve headings (#), paragraphs, ' +
  'lists, bold/italic emphasis, and code blocks. Output only the markdown, ' +
  'with no commentary.';
