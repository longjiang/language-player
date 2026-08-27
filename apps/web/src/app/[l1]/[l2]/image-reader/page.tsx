'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SavedWordContext } from '@langplayer/shared';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { parseMarkdown, type ReaderBlock } from '@/lib/parse-markdown';
import { epubLog } from '@/lib/epub-log';
import { ArrowLeft, ImageIcon, Loader2, Clipboard, Upload, X } from 'lucide-react';

/** Vision-OCR prompt for the image reader — the model returns the image's
 *  text as clean, block-level markdown (deepseek-v4-flash-vision-exp via
 *  /vision): blocks separated by blank lines so each reflows independently. */
const IMAGE_OCR_PROMPT =
  'Extract all text from this image as clean, properly formatted markdown. ' +
  'Separate each block element (headings, paragraphs, list items) with a blank ' +
  'line so blocks reflow independently. Keep each paragraph as flowing prose — ' +
  'do not insert line breaks inside a paragraph, and do not collapse distinct ' +
  'paragraphs together. Preserve headings (#), paragraphs, lists, bold/italic ' +
  'emphasis, and code blocks. Output only the markdown, with no commentary.';

/** Accepted image MIME types (mirrors msg.image_reader_supported). */
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/** One loaded image and its vision-OCR result (lazy, per selection). */
interface ImageEntry {
  id: string;
  name: string;
  dataUrl: string;
  md: string;
  blocks: ReaderBlock[] | null;
  converting: boolean;
  error?: boolean;
}

function isSupportedImage(file: File): boolean {
  return /^image\/(png|jpeg|gif|webp)$/.test(file.type);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `img-${Date.now()}-${counter}`;
}

/** Extract image files from a paste DataTransfer (ClipboardEvent/ClipboardItem). */
function imageFilesFromItems(items: DataTransferItemList | DataTransferItem[]): File[] {
  const list = Array.from(items);
  const files: File[] = [];
  for (const item of list) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

export default function ImageReaderPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const current = useMemo(
    () => images.find((im) => im.id === currentId) ?? null,
    [images, currentId],
  );

  /** Run the vision OCR for an image entry (idempotent; no-op if already
   *  OCR'd). Takes the entry directly so a fresh add/paste can OCR immediately
   *  without waiting for the images ref to catch up. */
  const runOcr = useCallback(async (entry: ImageEntry) => {
    if (!entry || entry.md || entry.converting) return;
    const { id } = entry;
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: true, error: false } : im)));
    epubLog(`image reader OCR start file=${entry.name}`);
    try {
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: entry.dataUrl, prompt: IMAGE_OCR_PROMPT }),
      });
      const data = res.ok ? await res.json() : null;
      const md = typeof data?.response === 'string' ? data.response : '';
      epubLog(`image reader OCR md length=${md.length}`);
      epubLog(`image reader OCR sample: ${md.slice(0, 160).replace(/\n/g, ' ⏎ ')}`);
      setImages((prev) => prev.map((im) => (
        im.id === id
          ? { ...im, md, blocks: md ? parseMarkdown(md) : [], converting: false }
          : im
      )));
    } catch (err) {
      epubLog(`image reader OCR failed: ${(err as Error)?.message ?? err}`);
      setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: false, error: true } : im)));
    }
  }, []);

  // Keep a ref to `images` so runOcr/setCurrent can read the latest entry
  // without the callback identity changing on every render.
  const imagesRef = useRef<ImageEntry[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  /** Add image files (from a drop, picker, or paste). Selects the first newly
   *  added image and starts its OCR; others OCR lazily on selection. */
  const addFiles = useCallback((files: File[]) => {
    const supported = files.filter(isSupportedImage);
    if (supported.length === 0) {
      setNotice(t('msg.no_image_in_clipboard'));
      return;
    }
    const pending: Promise<void>[] = [];
    const newEntries: ImageEntry[] = [];
    for (const file of supported) {
      const id = nextId();
      const entry: ImageEntry = { id, name: file.name, dataUrl: '', md: '', blocks: null, converting: false };
      newEntries.push(entry);
      const p = readAsDataUrl(file).then((dataUrl) => {
        entry.dataUrl = dataUrl;
      });
      pending.push(p);
    }
    setNotice(null);
    Promise.all(pending).then(() => {
      setImages((prev) => [...prev, ...newEntries]);
      // Open the first newly added image by default and kick off its OCR.
      const first = newEntries[0];
      if (first) {
        setCurrentId(first.id);
        void runOcr(first);
      }
    });
  }, [runOcr, t]);

  /** Switch the current image; lazily OCR it if it hasn't been read yet. */
  const selectImage = useCallback((id: string) => {
    setCurrentId(id);
    const entry = imagesRef.current.find((im) => im.id === id);
    if (entry && !entry.md && !entry.converting) {
      void runOcr(entry);
    }
  }, [runOcr]);

  /** Triggered by window paste (Ctrl/Cmd+V) — read image from the clipboard. */
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const files = imageFilesFromItems(e.clipboardData?.items ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }, [addFiles]);

  /** Paste button — read the clipboard asynchronously (Chromium). */
  const pasteFromButton = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], `clipboard-${Date.now()}.${imageType.split('/')[1] || 'png'}`, { type: imageType });
          addFiles([file]);
          return;
        }
      }
      setNotice(t('msg.no_image_in_clipboard'));
    } catch {
      setNotice(t('msg.no_image_in_clipboard'));
    }
  }, [addFiles, t]);

  // Global Ctrl/Cmd+V handler — intercept image pastes on all OSes.
  useEffect(() => {
    window.addEventListener('paste', handlePaste as EventListener);
    return () => window.removeEventListener('paste', handlePaste as EventListener);
  }, [handlePaste]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) addFiles(files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  // ── Reader callbacks (lemmatize / translate), same as the epub reader. ──
  const handleLemmatize = useCallback(async (texts: string[]) => {
    const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l2: l2.code }),
    });
    const data = res.ok ? await res.json() : null;
    return data?.results ?? [];
  }, [l2.code]);

  const handlePageTranslate = useCallback(async (texts: string[]) => {
    try {
      const { byKey } = await translateTextsKeyed(texts, l1.code, l2.code);
      return byKey;
    } catch {
      return {};
    }
  }, [l1.code, l2.code]);

  const ctx: Partial<SavedWordContext> = {
    textTitle: current?.name || t('title.image_reader'),
  };

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

  // Initial empty-state: the drop zone with file-select + paste buttons.
  const dropZone = (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <ImageIcon className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{t('msg.drop_images_here')}</p>
        <p className="text-xs text-muted-foreground">{t('msg.image_reader_supported')}</p>
        <p className="text-xs text-muted-foreground">{t('msg.image_reader_empty')}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Upload className="h-3.5 w-3.5" />
          {t('action.select_files')}
        </button>
        <button
          type="button"
          onClick={() => void pasteFromButton()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Clipboard className="h-3.5 w-3.5" />
          {t('action.paste')}
        </button>
      </div>
      {notice && <p className="text-xs text-destructive">{notice}</p>}
    </div>
  );

  // Loaded state: thumbnail sidebar + the current image's OCR'd reader.
  const loaded = images.length > 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-7xl flex-col px-4 py-6">
      {/* Title row */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => router.push(`/${l1.code}/${l2.code}/reader`)}
          aria-label={t('action.back')}
          title={t('action.back')}
          className="rounded-md p-1 text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">
          {current?.name || t('title.image_reader')}
        </h1>
        {/* Add-more controls (visible once images are loaded) */}
        {loaded && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" />
              {t('action.select_files')}
            </button>
            <button
              type="button"
              onClick={() => void pasteFromButton()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Clipboard className="h-3.5 w-3.5" />
              {t('action.paste')}
            </button>
            <button
              type="button"
              onClick={clearAll}
              aria-label={t('action.close')}
              title={t('action.close')}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p className="mb-3 text-xs text-destructive">{notice}</p>
      )}

      {!loaded ? dropZone : (
        <div className="flex min-h-0 flex-1 gap-4">
          {/* Thumbnail rail */}
          <div className="flex w-40 shrink-0 flex-col gap-2 overflow-y-auto pr-1">
            {images.map((im) => (
              <div
                key={im.id}
                role="button"
                tabIndex={0}
                aria-disabled={false}
                onClick={() => selectImage(im.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectImage(im.id); }}
                className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-colors ${
                  im.id === currentId ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.dataUrl} alt={im.name} className="aspect-[3/2] w-full object-cover" />
                {im.id === currentId && (
                  <div className="absolute inset-0 ring-2 ring-inset ring-primary" />
                )}
                {im.converting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(im.id); }}
                  aria-label={t('action.remove')}
                  title={t('action.remove')}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* OCR result (tokenized text) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            {current ? (
              current.converting ? (
                <div className="flex min-h-[40vh] flex-1 items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('msg.making_words_interactive')}</span>
                </div>
              ) : current.error ? (
                <div className="flex flex-1 items-center justify-center text-sm text-destructive">
                  {t('msg.image_reader_ocr_error')}
                </div>
              ) : (
                <ReaderPanel
                  l2={l2}
                  l1={l1}
                  text={current.md}
                  loading={false}
                  activeTab="read"
                  translating={false}
                  blocks={current.blocks}
                  ctx={ctx}
                  onTextChange={() => {}}
                  onTabChange={() => {}}
                  onTokenize={() => {}}
                  onFillSample={() => {}}
                  onPageTranslate={handlePageTranslate}
                  onLemmatize={handleLemmatize}
                  hideModeTabs
                />
              )
            ) : null}
          </div>
        </div>
      )}

      {/* Hidden multi-file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) addFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
