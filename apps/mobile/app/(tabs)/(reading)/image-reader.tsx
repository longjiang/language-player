import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Pressable, Image, Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { ReaderAskAiSheet } from '@/components/reader/ReaderAskAiSheet';
import { useReaderTocSearch, ReaderTocSearchOverlays } from '@/components/reader/reader-toc-search';
import { READER_ASK_AI_TEXT_PRESETS, type ReaderAiContent } from '@langplayer/utils';
import { IMAGE_OCR_PROMPT } from '@langplayer/shared';
import { downscaleImage } from '@/lib/downscale-image';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logerr, logwarn } from '@/lib/logger';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ArrowLeft, ImageIcon, Clipboard as ClipboardIcon, X } from 'lucide-react-native';

/** One loaded image and its vision-OCR result (lazy, per selection). */
interface ImageEntry {
  id: string;
  name: string;
  /** Thumbnail + OCR source (base64 data URL). */
  dataUrl: string;
  uri: string;
  /** OCR markdown with the leading `# title` heading stripped. */
  md: string;
  /** Title extracted from the OCR markdown's leading `# heading` (web parity:
   *  apps/web image-reader extractTitle). Null when the OCR had no title. */
  title: string | null;
  converting: boolean;
  error?: boolean;
  /** Why the OCR failed — the HTTP status + server message, the caught error,
   *  or a timeout. Rendered under the error text so a Release-build report is
   *  actionable without a device-console capture (diagnostic text, not prose:
   *  deliberately untranslated). */
  detail?: string;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `img-${Date.now()}-${counter}`;
}

/** Pull the leading `# <title>` heading out of the OCR markdown as the
 *  image's human-readable title; the rest is the body. Ported from apps/web
 *  image-reader/page.tsx so saved words get the same title on both platforms. */
function extractTitle(md: string): { title: string | null; body: string } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  const first = lines[i];
  const m = first?.match(/^#\s+(.+)$/);
  if (m) {
    const title = m[1]!.trim();
    const body = lines.slice(i + 1).join('\n').replace(/^\n+/, '');
    return { title, body };
  }
  return { title: null, body: md };
}

function mimeFor(name: string): string {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.(gif|webp|heic)$/i.test(name)) return 'image/webp';
  return 'image/jpeg';
}

/** One OCR request must not spin forever. The vision model can take ~30s for a
 *  dense page and the production front end gives up around 100s. */
const OCR_TIMEOUT_MS = 90_000;

/** Best-effort human-readable reason from a failed `/vision` response body
 *  (Flask answers `{ status, message }`). Empty string when there is none. */
function serverMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown } | null;
    if (parsed && typeof parsed.message === 'string') return parsed.message.slice(0, 160);
  } catch {
    // Not JSON (or truncated JSON) — fall through to the raw-body case.
  }
  return '';
}

export default function ImageReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay, getL2, updateL2 } = useSettingsContext();
  const t = useT();
  // Translation lines are PER-L2 (`l2[code].display.translation`).
  const showTranslation = getL2(l2Lang.code).display.translation;
  const router = useRouter();
  const { isMd } = useResponsive();

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Reader "Ask AI" summary chat. */
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [currentPageText, setCurrentPageText] = useState('');
  const imagesRef = useRef<ImageEntry[]>([]);
  useEffect(() => { imagesRef.current = images; }, [images]);

  const current = useMemo(
    () => images.find((im) => im.id === currentId) ?? null,
    [images, currentId],
  );

  /** Ids with an OCR request in flight. The `converting` flag lives in state
   *  (and in the `imagesRef` mirror, which lags a render behind), so a tap on a
   *  thumbnail moments after it was added could otherwise start a second
   *  request for the same image. */
  const ocrInFlight = useRef<Set<string>>(new Set());

  /** OCR a single image (idempotent — no-op if already OCR'd / converting).
   *  `known` lets a caller that just created the entry pass it directly:
   *  `imagesRef` only catches up with `setImages` after the next render, so a
   *  ref lookup from `append` no-ops and the image stays unread until the user
   *  taps its thumbnail. */
  const runOcr = useCallback(async (id: string, known?: ImageEntry) => {
    const entry = known ?? imagesRef.current.find((im) => im.id === id);
    if (!entry || entry.md || entry.converting) return;
    if (ocrInFlight.current.has(id)) return;
    ocrInFlight.current.add(id);
    setImages((prev) => prev.map((im) => (
      im.id === id ? { ...im, converting: true, error: false, detail: undefined } : im
    )));
    const url = `${PYTHON_API_URL}/vision`;
    log('[image-reader] OCR start', { name: entry.name, url });
    /** Put the image into the failed state, keeping the reason for the UI. */
    const fail = (detail: string) => {
      setImages((prev) => prev.map((im) => (
        im.id === id ? { ...im, converting: false, error: true, detail } : im
      )));
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
    try {
      const payload = await downscaleImage(entry.dataUrl);
      log(`[image-reader] OCR payload bytes=${payload.length}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: payload, prompt: IMAGE_OCR_PROMPT }),
        signal: controller.signal,
      });
      // Read the body once, as text. A failed request must be reported, never
      // swallowed into empty markdown: that used to leave a blank reader with
      // no explanation (which is how the Release-only OCR failure presented).
      const bodyText = await res.text();
      if (!res.ok) {
        const message = serverMessage(bodyText);
        const detail = `HTTP ${res.status}${message ? ` — ${message}` : ''}`;
        // non-info-level: the request itself failed and this status/body line is
        // the only record of why; it is what a Release-build report needs.
        logerr(`[image-reader] OCR HTTP ${res.status} — ${message || '(no message)'} body=${bodyText.slice(0, 300)}`);
        fail(detail);
        return;
      }
      let data: unknown = null;
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = null;
      }
      const md = typeof (data as { response?: unknown } | null)?.response === 'string'
        ? (data as { response: string }).response
        : '';
      if (!md) {
        // non-info-level: the server answered 200 with nothing usable — a real
        // failure whose body is needed to tell "cached empty" from "model gave up".
        logerr(`[image-reader] OCR empty response body=${bodyText.slice(0, 300)}`);
        fail('Empty OCR response');
        return;
      }
      // Diagnostics: log the exact prompt sent and the full markdown returned.
      log('[image-reader] OCR prompt: ' + IMAGE_OCR_PROMPT);
      log('[image-reader] OCR response:\n' + md);
      const { title, body } = extractTitle(md);
      log(`[image-reader] OCR md length=${md.length} title=${title ?? '(none)'}`);
      setImages((prev) => prev.map((im) => (
        im.id === id ? { ...im, md: body, title: title ?? im.title, converting: false, detail: undefined } : im
      )));
    } catch (err) {
      const detail = (err as Error)?.name === 'AbortError'
        ? `Timed out after ${Math.round(OCR_TIMEOUT_MS / 1000)}s`
        : String((err as Error)?.message ?? err).slice(0, 200);
      logwarn('[image-reader] OCR failed:', (err as Error)?.message ?? err);
      fail(detail);
    } finally {
      clearTimeout(timer);
      ocrInFlight.current.delete(id);
    }
  }, []);

  /** Switch current image; lazily OCR it if not yet read. */
  const selectImage = useCallback((id: string) => {
    setCurrentId(id);
    const entry = imagesRef.current.find((im) => im.id === id);
    if (entry && !entry.md && !entry.converting) void runOcr(id);
  }, [runOcr]);

  /** Append entries, select the first new one, and OCR it immediately. */
  const append = useCallback((entries: ImageEntry[]) => {
    if (entries.length === 0) return;
    setNotice(null);
    setImages((prev) => [...prev, ...entries]);
    const first = entries[0]!;
    setCurrentId(first.id);
    // Hand over the entry itself — see `runOcr`'s `known` argument.
    void runOcr(first.id, first);
  }, [runOcr]);

  /** Open image files with a document picker. */
  const addFromPicker = useCallback(async () => {
    const pick = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (pick.canceled || !pick.assets?.length) return;
    const entries: ImageEntry[] = [];
    for (const asset of pick.assets) {
      try {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const mime = mimeFor(asset.name ?? 'image');
        const dataUrl = `data:${mime};base64,${base64}`;
        entries.push({
          id: nextId(),
          name: asset.name ?? 'image',
          dataUrl,
          uri: dataUrl,
          md: '',
          title: null,
          converting: false,
        });
      } catch (err) {
        logwarn('[image-reader] picker read failed:', (err as Error)?.message ?? err);
      }
    }
    append(entries);
  }, [append]);

  /** Paste an image from the OS clipboard. */
  const pasteFromClipboard = useCallback(async () => {
    try {
      const img = await Clipboard.getImageAsync({ format: 'png' });
      if (!img) {
        setNotice(t('msg.no_image_in_clipboard'));
        return;
      }
      const dataUrl = img.data;
      append([{
        id: nextId(),
        name: `clipboard-${Date.now()}.png`,
        dataUrl,
        uri: dataUrl,
        md: '',
        title: null,
        converting: false,
      }]);
    } catch (err) {
      logwarn('[image-reader] clipboard paste failed:', (err as Error)?.message ?? err);
      setNotice(t('msg.no_image_in_clipboard'));
    }
  }, [append, t]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const next = prev.filter((im) => im.id !== id);
      if (currentId === id) setCurrentId(next[0]?.id ?? null);
      return next;
    });
  }, [currentId]);

  const clearAll = useCallback(() => {
    setImages([]);
    setCurrentId(null);
    setNotice(null);
  }, []);

  // ── Pagination for the current image's OCR'd markdown ──
  const pagination = useEpubPagination({
    text: current?.md ?? '',
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation,
    translationSplit: display.translationSplit,
    resetKey: current ? current.id : null,
    estimate: true,
  });

  const handleOpenLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href)) {
      Linking.openURL(href).catch(() => {});
    }
  }, []);

  // In-content search over the current image's OCR'd blocks (quote chips open it).
  const tocSearch = useReaderTocSearch({
    blocks: pagination.blocks,
    goToBlock: pagination.goToBlock,
    currentBlockIndex: undefined,
  });

  // ── Empty state ──
  if (images.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-md p-1.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={t('action.back')}
          >
            <ArrowLeft size={20} color={ICON_MUTED} />
          </Pressable>
          <Text numberOfLines={1} className="flex-1 text-lg font-bold text-foreground">
            {t('title.image_reader')}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 items-center justify-center gap-4 px-8 py-10">
            <ImageIcon size={44} color={ICON_MUTED} />
            <Text className="text-center text-sm font-medium text-foreground">
              {t('msg.drop_images_here')}
            </Text>
            <Text className="text-center text-xs text-muted-foreground">
              {t('msg.image_reader_supported')}
            </Text>
            <Text className="text-center text-xs text-muted-foreground">
              {t('msg.image_reader_empty')}
            </Text>
            {notice && <Text className="text-center text-xs text-destructive">{notice}</Text>}
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => void addFromPicker()}
                className="flex-row items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel={t('action.select_files')}
              >
                <Text className="text-xs font-medium text-primary-foreground">{t('action.select_files')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void pasteFromClipboard()}
                className="flex-row items-center gap-1.5 rounded-md border border-border px-3.5 py-2 active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('action.paste')}
              >
                <ClipboardIcon size={14} color={ICON_MUTED} />
                <Text className="text-xs font-medium text-foreground">{t('action.paste')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Loaded state: thumbnail rail + OCR'd reader ──
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="rounded-md p-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.back')}
        >
          <ArrowLeft size={20} color={ICON_MUTED} />
        </Pressable>
        <Text numberOfLines={1} className="flex-1 text-lg font-bold text-foreground">
          {current?.title || current?.name || t('title.image_reader')}
        </Text>
        <Pressable
          onPress={() => void addFromPicker()}
          className="flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.select_files')}
        >
          <Text className="text-xs font-medium text-foreground">{t('action.select_files')}</Text>
        </Pressable>
        <Pressable
          onPress={() => void pasteFromClipboard()}
          className="flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.paste')}
        >
          <ClipboardIcon size={14} color={ICON_MUTED} />
          <Text className="text-xs font-medium text-foreground">{t('action.paste')}</Text>
        </Pressable>
        <Pressable
          onPress={clearAll}
          className="rounded-md p-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.close')}
        >
          <X size={18} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* Thumbnail rail */}
      <View className="border-b border-border">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
        >
          {images.map((im) => (
            <Pressable
              key={im.id}
              onPress={() => selectImage(im.id)}
              className={`relative overflow-hidden rounded-lg border-2 ${im.id === currentId ? 'border-primary' : 'border-border'}`}
              accessibilityRole="button"
              accessibilityLabel={im.name}
            >
              <Image source={{ uri: im.uri }} style={{ width: 88, height: 60 }} resizeMode="cover" />
              {im.converting && (
                <View className="absolute inset-0 items-center justify-center bg-background/60">
                  <ActivityIndicator size="small" color={ICON_MUTED} />
                </View>
              )}
              <Pressable
                onPress={() => removeImage(im.id)}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
                accessibilityRole="button"
                accessibilityLabel={t('action.remove')}
              >
                <X size={12} color={ICON_MUTED} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {notice && <Text className="px-4 py-2 text-center text-xs text-destructive">{notice}</Text>}

      {/* OCR result (tokenized text) */}
      <View className="flex-1">
        {current ? (current.converting ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={ICON_MUTED} />
            <Text className="mt-3 text-sm text-muted-foreground">{t('msg.recognizing_text')}</Text>
          </View>
        ) : current.error ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-sm text-destructive">{t('msg.image_reader_ocr_error')}</Text>
            {current.detail && (
              <Text className="mt-2 text-center text-xs text-muted-foreground">{current.detail}</Text>
            )}
          </View>
        ) : (
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
            l2Code={l2Lang.code}
            l1Code={l1Lang.code}
            showTranslation={showTranslation}
            onToggleTranslation={() => {
              const next = !showTranslation;
              updateL2(l2Lang.code, {
                display: { ...getL2(l2Lang.code).display, translation: next },
              });
            }}
            showTextActions
            translationSideBySide={isMd}
            selectionDictionary
            firstLineIndent
            onOpenLink={handleOpenLink}
            onOpenSearch={tocSearch.openSearch}
            onOpenAskAi={() => setAskAiOpen(true)}
            onPageTextChange={setCurrentPageText}
            // Saved words carry the OCR `# title` (web parity: apps/web
            // image-reader passes `title || name || Image Reader`).
            ctx={{ textTitle: current?.title || current?.name || t('title.image_reader') }}
            textScale={1}
            t={t}
          />
        )) : null}
      </View>

      {/* ── "Ask AI" summary chat (image reader) ── */}
      <ReaderAskAiSheet
        open={askAiOpen}
        onClose={() => setAskAiOpen(false)}
        title={current?.title || current?.name || t('title.image_reader')}
        presets={READER_ASK_AI_TEXT_PRESETS}
        storageKey={currentId ? `lp-ask-ai:image:${currentId}` : undefined}
        content={
          {
            text: current?.md ?? '',
            page: currentPageText,
            chapter: null,
            bookUpToChapter: null,
          } satisfies ReaderAiContent
        }
        onQuotePress={tocSearch.openSearchFor}
      />

      {/* ── In-content search modal (image reader) ── */}
      <ReaderTocSearchOverlays
        headings={tocSearch.headings}
        tocOpen={tocSearch.tocOpen}
        onTocClose={() => tocSearch.setTocOpen(false)}
        onTocSelect={tocSearch.handleTocSelect}
        searchOpen={tocSearch.searchOpen}
        onSearchClose={() => tocSearch.setSearchOpen(false)}
        onSearchSelect={tocSearch.handleSearchSelect}
        blocks={pagination.blocks}
        searchQuery={tocSearch.searchQuery}
        searchNonce={tocSearch.searchNonce}
      />
    </View>
  );
}
