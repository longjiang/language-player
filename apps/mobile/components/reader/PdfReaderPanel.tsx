import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { PdfPageImage } from '@dariyd/react-native-pdf-page-image';
import { Pressable } from '@/components/ui/pressable';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ArrowLeft, LayoutGrid, X } from 'lucide-react-native';
import { log, logwarn } from '@/lib/logger';

/** Scale for OCR page rendering (px per PDF point). */
const OCR_SCALE = 2.0;
/** Longest-edge cap for thumbnail page renders. */
const THUMB_MAX_DIM = 320;
/** Longest-edge cap for the OCR image sent to /vision. */
const OCR_MAX_DIM = 1800;

/** Render a page to a base64 JPEG data URL for the /vision endpoint. */
async function pageToDataUrl(pdfUri: string, page: number): Promise<string> {
  // First render at a capped size for OCR, re-encoding to JPEG.
  let img = await PdfPageImage.generate(pdfUri, page, OCR_SCALE, {
    format: 'jpeg',
    quality: 82,
    maxDimension: OCR_MAX_DIM,
  });
  try {
    const b64 = await FileSystem.readAsStringAsync(img.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}`;
  } finally {
    await PdfPageImage.close(img.uri).catch(() => {});
  }
}

/**
 * Mobile PDF reader (format: 'pdf' shelf entries):
 *  - open → a grid of page thumbnails (native PdfPageImage renderer);
 *  - tap a page → the page image is converted to markdown by DeepSeek Vision
 *    (POST /vision, cached) and loaded into the shared paginated reader.
 *
 * Rendered by the native `@dariyd/react-native-pdf-page-image` TurboModule —
 * no pdf.js WebView, no `assetExts` change.
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

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  /** Reading session: the page being read + its AI-converted markdown. */
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertedMd, setConvertedMd] = useState('');
  /** Cache of already-converted pages (markdown). */
  const mdCacheRef = useRef<Record<number, string>>({});

  const pdfPagination = useEpubPagination({
    text: currentPage !== null ? convertedMd : '',
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    translationSplit: display.translationSplit,
    resetKey: currentPage !== null ? `pdf-${currentPage}` : null,
    estimate: true,
  });

  const pageCountKnown = pageCount ?? 0;

  // Open the PDF → page count; clean up temp files on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await PdfPageImage.open(uri);
        if (!cancelled) setPageCount(info.pageCount);
      } catch (err) {
        logwarn('[pdf] open failed:', (err as Error)?.message ?? err);
      }
    })();
    return () => {
      cancelled = true;
      void PdfPageImage.close(uri).catch(() => {});
    };
  }, [uri]);

  const renderThumb = useCallback((page: number) => {
    if (thumbs[page]) return;
    void PdfPageImage.generate(uri, page, 1.0, {
      format: 'jpeg',
      quality: 70,
      maxDimension: THUMB_MAX_DIM,
    }).then((img) => {
      setThumbs((prev) => (prev[page] ? prev : { ...prev, [page]: img.uri }));
    }).catch((err) => {
      logwarn('[pdf] thumb render failed:', (err as Error)?.message ?? err);
    });
  }, [uri, thumbs]);

  // Pre-render the first few thumbnails once the document is ready.
  useEffect(() => {
    if (!pageCount) return;
    for (let i = 0; i < Math.min(pageCount, 6); i++) renderThumb(i);
  }, [pageCount, renderThumb]);

  /** Tap a thumbnail: convert the page to markdown via Vision, read it. */
  const openPage = useCallback(async (page: number) => {
    setCurrentPage(page);
    setConverting(true);
    if (mdCacheRef.current[page]) {
      setConvertedMd(mdCacheRef.current[page]!);
      setConverting(false);
      return;
    }
    setConvertedMd('');
    log('[pdf] page → vision OCR', { page });
    try {
      const payload = await pageToDataUrl(uri, page);
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: payload,
          prompt:
            'Extract all text from this PDF page image as clean markdown. ' +
            'Preserve headings, paragraphs, lists, bold/italic emphasis, and code ' +
            'blocks. Output only the markdown, with no commentary.',
        }),
      });
      const data = res.ok ? await res.json() : null;
      const md = typeof data?.response === 'string' ? data.response : '';
      mdCacheRef.current[page] = md;
      setConvertedMd(md);
    } catch (err) {
      logwarn('[pdf] page conversion failed:', (err as Error)?.message ?? err);
      setConvertedMd('');
    } finally {
      setConverting(false);
    }
  }, [uri]);

  const handleThumbnails = useCallback(() => {
    setCurrentPage(null);
    setConvertedMd('');
  }, []);

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
            {fileName} — {t('msg.pdf_page', { page: String(currentPage + 1) })}
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
            textScale={1}
            t={t}
          />
        )}
      </View>
    );
  }

  // ── Thumbnail grid view ──
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Pressable
          onPress={onClose}
          className="rounded-md p-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.close')}
        >
          <X size={18} color={ICON_MUTED} />
        </Pressable>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-semibold text-foreground">
          {fileName}
        </Text>
      </View>

      {pageCount === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={ICON_MUTED} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View className="flex-row flex-wrap gap-3">
            {Array.from({ length: pageCount }, (_, i) => i).map((page) => {
              const thumb = thumbs[page];
              return (
                <Pressable
                  key={page}
                  onPress={() => void openPage(page)}
                  className="overflow-hidden rounded-lg border border-border"
                  accessibilityRole="button"
                  accessibilityLabel={`${t('msg.pdf_page', { page: String(page + 1) })}`}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={{ width: 120, height: 160 }} resizeMode="cover" />
                  ) : (
                    <View className="items-center justify-center" style={{ width: 120, height: 160 }}>
                      <ActivityIndicator size="small" color={ICON_MUTED} />
                    </View>
                  )}
                  <View className="border-t border-border bg-card px-1.5 py-1">
                    <Text className="text-center text-[11px] text-muted-foreground">{page + 1}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
