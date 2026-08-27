import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Pressable, Image, Linking, Modal, useWindowDimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { ZoomableImage } from '@/components/reader/ZoomableImage';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { peekPendingOpen, consumePendingOpen } from '@/lib/file-open';
import { loadImageGallery, saveImageGallery } from '@/lib/image-reader-store';
import { readerClampedContentWidth } from '@/lib/reader-layout';
import { downscaleImage } from '@/lib/downscale-image';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';
import { ICON_MUTED } from '@/lib/theme-colors';
import {
  ImageIcon, Clipboard as ClipboardIcon, X, Plus, Upload, PanelRightOpen, PanelRightClose,
} from 'lucide-react-native';

/** Vision-OCR prompt for the image reader (deepseek-v4-flash-vision-exp) — the
 *  model returns a leading `# <title>` heading (human-readable image title)
 *  followed by clean, block-level markdown: blocks separated by blank lines so
 *  each reflows independently. */
const IMAGE_OCR_PROMPT =
  'Transcribe all text in this image into clean, well-formatted markdown. ' +
  'Start with a single H1 heading (a line starting with "# ") giving a short, ' +
  'human-readable title for the image. Read in natural reading order and join ' +
  'wrapped lines into flowing prose — no hard line breaks inside a paragraph. ' +
  'Preserve headings, paragraphs, lists, emphasis, and code blocks. Output ' +
  'only the markdown.';

/** One loaded image and its vision-OCR result (lazy, per selection). */
interface ImageEntry {
  id: string;
  name: string;
  /** Thumbnail + OCR source (base64 data URL). */
  dataUrl: string;
  uri: string;
  /** Human-readable title returned by the vision model (first `# ` heading). */
  title?: string;
  md: string;
  converting: boolean;
  error?: boolean;
}

/** Pull the leading `# <title>` heading out of the OCR markdown as the image's
 *  human-readable title; the rest is the body. Falls back to no title. */
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

let counter = 0;
function nextId(): string {
  counter += 1;
  return `img-${Date.now()}-${counter}`;
}

function mimeFor(name: string): string {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.(gif|webp|heic)$/i.test(name)) return 'image/webp';
  return 'image/jpeg';
}

/** A single thumbnail tile. Measures the loaded image's natural dimensions so
 *  the tile renders at the image's original aspect ratio (no forced 3:2 crop),
 *  matching apps/web's image-reader sidebar. */
function ThumbnailTile({ im, currentId, onSelect, onPreview, onRemove, t }: {
  im: ImageEntry;
  currentId: string | null;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
  t: (key: string) => string;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <Pressable
      key={im.id}
      onPress={() => {
        // Clicking the current image opens its full-size preview; clicking
        // another image selects it.
        if (im.id === currentId) onPreview(im.id);
        else onSelect(im.id);
      }}
      className={`relative w-full overflow-hidden rounded-lg border-2 ${im.id === currentId ? 'border-primary' : 'border-border'}`}
      accessibilityRole="button"
      accessibilityLabel={im.title || im.name}
    >
      <Image
        source={{ uri: im.uri }}
        style={{ width: '100%', aspectRatio: ratio ?? 3 / 2 }}
        resizeMode={ratio ? 'contain' : 'cover'}
        onLoad={(e) => {
          const s = e.nativeEvent?.source;
          if (s?.width && s?.height) setRatio(s.width / s.height);
        }}
      />
      {im.id === currentId && (
        <View className="absolute inset-0 border-2 border-primary" />
      )}
      {im.converting && (
        <View className="absolute inset-0 items-center justify-center bg-background/60">
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </View>
      )}
      <Pressable
        onPress={() => onRemove(im.id)}
        className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
        accessibilityRole="button"
        accessibilityLabel={t('action.remove')}
      >
        <X size={12} color={ICON_MUTED} />
      </Pressable>
    </Pressable>
  );
}

export default function ImageReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const { isMd } = useResponsive();
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();
  const { width: winWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Empty-state drop zone: clamp to the content container (logo → avatar width)
  // like the reader text column, centered, minus the horizontal padding.
  const emptyWidth = readerClampedContentWidth(Math.max(0, winWidth - 64));

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Id of the image whose full-size preview modal is open (current image). */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** True once the persisted gallery has been loaded. Persisting is a no-op until then. */
  const [initialized, setInitialized] = useState(false);
  const imagesRef = useRef<ImageEntry[]>([]);
  useEffect(() => { imagesRef.current = images; }, [images]);

  const current = useMemo(
    () => images.find((im) => im.id === currentId) ?? null,
    [images, currentId],
  );

  const preview = useMemo(
    () => images.find((im) => im.id === previewId) ?? null,
    [images, previewId],
  );

  // Restore the persisted gallery on mount (survives navigation/refresh).
  useEffect(() => {
    if (initialized) return;
    (async () => {
      try {
        const g = await loadImageGallery();
        if (g && g.entries.length > 0) {
          const entries = g.entries.map((e) => ({
            id: e.id,
            name: e.name,
            dataUrl: e.dataUrl,
            uri: e.dataUrl,
            title: e.title,
            md: e.md,
            converting: false,
            error: e.error,
          }));
          setImages(entries);
          const curId = g.currentId && entries.some((e) => e.id === g.currentId) ? g.currentId : entries[0]!.id;
          setCurrentId(curId);
        }
        setInitialized(true);
      } catch (err) {
        logwarn('[image-reader] gallery restore failed:', (err as Error)?.message ?? err);
        setInitialized(true);
      }
    })();
  }, [initialized]);

  // Persist the gallery whenever it changes (after the initial restore).
  useEffect(() => {
    if (!initialized) return;
    void saveImageGallery({
      entries: images.map((e) => ({
        id: e.id,
        name: e.name,
        dataUrl: e.dataUrl,
        title: e.title,
        md: e.md,
        error: e.error,
      })),
      currentId,
    });
  }, [images, currentId, initialized]);

  /** OCR a single image (idempotent — no-op if already OCR'd / converting).
   *  Takes the entry directly so a fresh add/paste can OCR immediately without
   *  waiting for the images ref to catch up. */
  const runOcr = useCallback(async (entry: ImageEntry) => {
    if (!entry || entry.md || entry.converting) return;
    const { id } = entry;
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: true, error: false } : im)));
    log('[image-reader] OCR start', { name: entry.name });
    try {
      // Downscale + re-encode before /vision to cap token usage.
      const payload = await downscaleImage(entry.dataUrl);
      log('[image-reader] OCR payload b64', { from: entry.dataUrl.length, to: payload.length });
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: payload, prompt: IMAGE_OCR_PROMPT }),
      });
      const data = res.ok ? await res.json() : null;
      const md = typeof data?.response === 'string' ? data.response : '';
      const { title, body } = extractTitle(md);
      log('[image-reader] OCR result', { name: entry.name, mdLength: md.length, title: title ?? null, sample: body.slice(0, 160) });
      setImages((prev) => prev.map((im) => (
        im.id === id ? { ...im, title: title ?? im.title, md: body, converting: false } : im
      )));
    } catch (err) {
      logwarn('[image-reader] OCR failed:', (err as Error)?.message ?? err);
      setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: false, error: true } : im)));
    }
  }, []);

  // After restore, OCR the current image if it has no result yet.
  useEffect(() => {
    if (!initialized) return;
    const cur = images.find((im) => im.id === currentId);
    if (cur && !cur.md && !cur.converting && !cur.error) void runOcr(cur);
  }, [initialized, currentId, images, runOcr]);

  /** Switch current image; lazily OCR it if not yet read. */
  const selectImage = useCallback((id: string) => {
    setCurrentId(id);
    const entry = imagesRef.current.find((im) => im.id === id);
    if (entry && !entry.md && !entry.converting) void runOcr(entry);
  }, [runOcr]);

  /** Append entries, select the first new one, and OCR the selection. */
  const append = useCallback((entries: ImageEntry[]) => {
    if (entries.length === 0) return;
    setNotice(null);
    setImages((prev) => [...prev, ...entries]);
    // Open the first newly added image by default and kick off its OCR.
    const first = entries[0]!;
    setCurrentId(first.id);
    void runOcr(first);
  }, [runOcr]);

  /** Multi-file image picker. */
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
          converting: false,
        });
      } catch (err) {
        logwarn('[image-reader] picker read failed:', (err as Error)?.message ?? err);
      }
    }
    append(entries);
  }, [append]);

  /** Paste an image from the OS clipboard (iOS/Android/Web). */
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
    showTranslation: display.translation,
    translationSplit: display.translationSplit,
    resetKey: current ? current.id : null,
    estimate: true,
  });

  const handleOpenLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href)) {
      Linking.openURL(href).catch(() => {});
    }
  }, []);

  // OS file-open (file handling): an image opened externally routes to this
  // screen (the epub screen navigates here and leaves the open pending).
  useFocusEffect(
    useCallback(() => {
      const f = peekPendingOpen();
      if (!f || f.kind !== 'image') return;
      consumePendingOpen();
      log('[image-reader] file-open → image', { name: f.name, kind: f.kind });
      void (async () => {
        try {
          const base64 = await FileSystem.readAsStringAsync(f.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const mime = mimeFor(f.name);
          const dataUrl = `data:${mime};base64,${base64}`;
          append([{ id: nextId(), name: f.name, dataUrl, uri: dataUrl, md: '', converting: false }]);
        } catch (err) {
          logwarn('[image-reader] file-open read failed:', (err as Error)?.message ?? err);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [append]),
  );

  /** Placeholder "add next image" tile below the last thumbnail. */
  const addTile = (
    <View className="w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-2">
      <Plus size={18} color={ICON_MUTED} />
      <View className="flex-row items-center gap-1.5">
        <Pressable
          onPress={() => void addFromPicker()}
          className="flex-row items-center gap-1 rounded-md bg-primary px-2 py-1 active:opacity-90"
          accessibilityRole="button"
          accessibilityLabel={t('action.select_files')}
        >
          <Upload size={12} color={ICON_MUTED} />
          <Text className="text-[11px] font-medium text-primary-foreground">{t('action.select_files')}</Text>
        </Pressable>
        <Pressable
          onPress={() => void pasteFromClipboard()}
          className="flex-row items-center gap-1 rounded-md border border-border px-2 py-1 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.paste')}
        >
          <ClipboardIcon size={12} color={ICON_MUTED} />
          <Text className="text-[11px] font-medium text-foreground">{t('action.paste')}</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Empty state ──
  if (images.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
          <Text numberOfLines={1} className="flex-1 text-lg font-bold text-foreground">
            {t('title.image_reader')}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}>
          <View
            className="flex-1 items-center justify-center gap-4"
            style={{ width: emptyWidth, alignSelf: 'center' }}
          >
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
                <Upload size={14} color={ICON_MUTED} />
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

  // ── Loaded state: OCR'd reader (main) + right collapsible thumbnail sidebar ──
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Text numberOfLines={1} className="flex-1 text-lg font-bold text-foreground">
          {current?.title || current?.name || t('title.image_reader')}
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
          onPress={clearAll}
          className="rounded-md p-1.5 active:bg-muted"
          accessibilityRole="button"
          accessibilityLabel={t('action.close')}
        >
          <X size={18} color={ICON_MUTED} />
        </Pressable>
      </View>

      {notice && <Text className="px-4 py-2 text-center text-xs text-destructive">{notice}</Text>}

      {/* Content row — main OCR reader + right thumbnail sidebar */}
      <View className="flex-1" style={{ flexDirection: isWide ? 'row' : 'column' }}>
        <View className="flex-1">
          {current ? (current.converting ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={ICON_MUTED} />
              <Text className="mt-3 text-sm text-muted-foreground">{t('msg.making_words_interactive')}</Text>
            </View>
          ) : current.error ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-center text-sm text-destructive">{t('msg.image_reader_ocr_error')}</Text>
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
              showTranslation={display.translation}
              onToggleTranslation={() => {
                const next = !display.translation;
                updateDisplay({ translation: next });
              }}
              showTextActions
              translationSideBySide={isMd}
              selectionDictionary
              firstLineIndent
              onOpenLink={handleOpenLink}
              textScale={1}
              t={t}
            />
          )) : null}
        </View>

        {/* Thumbnail sidebar — right, collapsible (standard Sidebar). */}
        <Sidebar
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sidebarOpen={sidebarOpen}
          title={t('label.images')}
          desktopClassName="w-60 ml-3"
          bodyClassName="p-4"
        >
          <View className="flex-col items-center gap-3">
            {images.map((im) => (
              <ThumbnailTile
                key={im.id}
                im={im}
                currentId={currentId}
                onSelect={selectImage}
                onPreview={setPreviewId}
                onRemove={removeImage}
                t={t}
              />
            ))}
            {addTile}
          </View>
        </Sidebar>
      </View>

      {/* Full-size image preview — tap to zoom in/out, pinch to zoom. */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewId(null)}
      >
        <GestureHandlerRootView className="flex-1 bg-black/90">
          <ZoomableImage uri={preview?.dataUrl ?? ''} />
          <Pressable
            onPress={() => setPreviewId(null)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2"
            accessibilityRole="button"
            accessibilityLabel={t('action.close')}
          >
            <X size={20} color="#fff" />
          </Pressable>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
