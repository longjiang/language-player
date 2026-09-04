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
import { READER_ASK_AI_TEXT_PRESETS, truncateReaderAiContent, type ReaderAiContent } from '@langplayer/utils';
import { IMAGE_OCR_PROMPT } from '@langplayer/shared';
import { downscaleImage } from '@/lib/downscale-image';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';
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

export default function ImageReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
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

  /** OCR a single image (idempotent — no-op if already OCR'd / converting). */
  const runOcr = useCallback(async (id: string) => {
    const entry = imagesRef.current.find((im) => im.id === id);
    if (!entry || entry.md || entry.converting) return;
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: true, error: false } : im)));
    log('[image-reader] OCR start', { name: entry.name });
    try {
      const payload = await downscaleImage(entry.dataUrl);
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: payload, prompt: IMAGE_OCR_PROMPT }),
      });
      const data = res.ok ? await res.json() : null;
      const md = typeof data?.response === 'string' ? data.response : '';
      // Diagnostics: log the exact prompt sent and the full markdown returned.
      log('[image-reader] OCR prompt: ' + IMAGE_OCR_PROMPT);
      log('[image-reader] OCR response:\n' + md);
      const { title, body } = extractTitle(md);
      log(`[image-reader] OCR md length=${md.length} title=${title ?? '(none)'}`);
      setImages((prev) => prev.map((im) => (
        im.id === id ? { ...im, md: body, title: title ?? im.title, converting: false } : im
      )));
    } catch (err) {
      logwarn('[image-reader] OCR failed:', (err as Error)?.message ?? err);
      setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: false, error: true } : im)));
    }
  }, []);

  /** Switch current image; lazily OCR it if not yet read. */
  const selectImage = useCallback((id: string) => {
    setCurrentId(id);
    const entry = imagesRef.current.find((im) => im.id === id);
    if (entry && !entry.md && !entry.converting) void runOcr(id);
  }, [runOcr]);

  /** Append entries, select the first new one, and OCR the selection. */
  const append = useCallback((entries: ImageEntry[]) => {
    if (entries.length === 0) return;
    setNotice(null);
    setImages((prev) => [...prev, ...entries]);
    const first = entries[0]!;
    setCurrentId(first.id);
    void runOcr(first.id);
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
        content={
          {
            text: truncateReaderAiContent(current?.md ?? ''),
            page: truncateReaderAiContent(currentPageText),
            chapter: null,
            bookUpToChapter: null,
          } satisfies ReaderAiContent
        }
      />
    </View>
  );
}
