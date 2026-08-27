import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { PdfViewer, type PdfViewerHandle, type PdfViewerInfo, type PdfOutlineItem } from '@/lib/pdf-viewer';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ArrowLeft, ChevronDown, LayoutGrid, List, X } from 'lucide-react-native';
import { log, logwarn } from '@/lib/logger';

/**
 * Mobile PDF reader (format: 'pdf' shelf entries):
 *  - open → a grid of page thumbnails (pdf.js inside a hidden WebView);
 *  - tap a page → the page image is converted to markdown by DeepSeek Vision
 *    (POST /vision, cached) and loaded into the shared paginated reader;
 *  - the bottom bar carries a TOC button (the PDF outline) and a Thumbnails
 *    button (back to the grid).
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

  const viewerRef = useRef<PdfViewerHandle>(null);
  const [info, setInfo] = useState<PdfViewerInfo | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  /** Reading session: the page being read + its AI-converted markdown. */
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertedMd, setConvertedMd] = useState('');
  const [tocOpen, setTocOpen] = useState(false);

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

  /** Tap a thumbnail: convert the page to markdown via Vision, read it. */
  const openPage = useCallback(async (page: number) => {
    setCurrentPage(page);
    setConverting(true);
    setConvertedMd('');
    log('[pdf] page → vision OCR', { page });
    try {
      const img = await viewerRef.current?.renderPage(page, 1.5);
      if (!img) throw new Error('page render failed');
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: img,
          prompt:
            'Extract all text from this PDF page image as clean, properly ' +
            'formatted markdown. Separate each block element (headings, ' +
            'paragraphs, list items) with a blank line so blocks reflow ' +
            'independently. Keep each paragraph as flowing prose — do not insert ' +
            'line breaks inside a paragraph, and do not collapse distinct ' +
            'paragraphs together. Preserve headings (#), paragraphs, lists, ' +
            'bold/italic emphasis, and code blocks. Output only the markdown, ' +
            'with no commentary.',
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

  const handleThumbnails = useCallback(() => {
    setCurrentPage(null);
    setConvertedMd('');
  }, []);

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

  // ── Reading view (a converted page in the paginated reader) ──
  if (currentPage !== null) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
          <Pressable
            onPress={handleThumbnails}
            className="rounded-md p-1.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={t('action.thumbnails')}
          >
            <LayoutGrid size={18} color={ICON_MUTED} />
          </Pressable>
          <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-semibold text-foreground">
            {fileName} — {t('msg.pdf_page', { page: String(currentPage) })}
          </Text>
          <Pressable
            onPress={onClose}
            className="rounded-md p-1.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={t('action.close')}
          >
            <ArrowLeft size={18} color={ICON_MUTED} />
          </Pressable>
        </View>
        {converting ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={ICON_MUTED} />
            <Text className="mt-3 text-sm text-muted-foreground">
              {t('msg.making_words_interactive')}
            </Text>
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
            onOpenThumbnails={handleThumbnails}
            textScale={1}
            t={t}
          />
        )}

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
        <PdfViewer uri={uri} ref={viewerRef} onInfo={setInfo} />
      </View>
    );
  }

  // ── Thumbnails grid (the PDF's "open" state) ──
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Pressable
          onPress={onClose}
          className="rounded-md p-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.back')}
        >
          <ArrowLeft size={18} color={ICON_MUTED} />
        </Pressable>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-lg font-bold text-foreground">
          {fileName}
        </Text>
      </View>
      <ScrollView className="flex-1 px-4 py-4">
        <Text className="mb-3 text-xs text-muted-foreground">{t('msg.pdf_tap_page_hint')}</Text>
        <View className="flex-row flex-wrap" style={{ gap: 16 }}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
            <Pressable
              key={page}
              onPress={() => void openPage(page)}
              className="rounded-lg p-1 active:bg-muted"
              style={{ width: 140 }}
              accessibilityRole="button"
              accessibilityLabel={t('msg.pdf_page', { page: String(page) })}
            >
              <View
                className="w-full overflow-hidden rounded-md border border-border bg-muted"
                style={{ aspectRatio: 3 / 4 }}
                onLayout={() => renderThumb(page)}
              >
                {thumbs[page] ? (
                  <Image source={{ uri: thumbs[page] }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Text className="text-xs text-muted-foreground">{page}</Text>
                  </View>
                )}
              </View>
              <Text className="mt-1 w-full text-center text-xs text-muted-foreground">{page}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <PdfViewer uri={uri} ref={viewerRef} onInfo={setInfo} />
    </View>
  );
}
