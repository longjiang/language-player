'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { IMAGE_OCR_PROMPT, type SavedWordContext } from '@langplayer/shared';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { parseMarkdown, type ReaderBlock } from '@/lib/parse-markdown';
import { Sidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/reader/zoomable-image';
import { epubLog } from '@/lib/epub-log';
import { loadImageGallery, saveImageGallery } from '@/lib/image-reader-store';
import { downscaleImage } from '@/lib/downscale-image';
import {
  ImageIcon, Loader2, Clipboard, Upload, X, Plus, PanelRight, PanelRightClose,
} from 'lucide-react';

/** Accepted image MIME types (mirrors msg.image_reader_supported). */
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/** One loaded image and its vision-OCR result (lazy, per selection). */
interface ImageEntry {
  id: string;
  name: string;
  dataUrl: string;
  /** Human-readable title returned by the vision model (first `# ` heading). */
  title?: string;
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

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Id of the image whose full-size preview dialog is open (current image). */
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Standard right-side sidebar: persistent collapsible panel on desktop, sheet on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** True once the persisted gallery has been loaded. Persisting is a no-op until then. */
  const [initialized, setInitialized] = useState(false);

  const current = useMemo(
    () => images.find((im) => im.id === currentId) ?? null,
    [images, currentId],
  );

  const previewEntry = useMemo(
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
            title: e.title,
            md: e.md,
            blocks: e.md ? parseMarkdown(e.md) : null,
            converting: false,
            error: e.error,
          }));
          setImages(entries);
          const curId = g.currentId && entries.some((e) => e.id === g.currentId) ? g.currentId : entries[0]!.id;
          setCurrentId(curId);
        }
        setInitialized(true);
      } catch (err) {
        epubLog(`image reader gallery restore failed: ${(err as Error)?.message ?? err}`);
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

  /** Run the vision OCR for an image entry (idempotent; no-op if already
   *  OCR'd). Takes the entry directly so a fresh add/paste can OCR immediately
   *  without waiting for the images ref to catch up. */
  const runOcr = useCallback(async (entry: ImageEntry) => {
    if (!entry || entry.md || entry.converting) return;
    const { id } = entry;
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: true, error: false } : im)));
    epubLog(`image reader OCR start file=${entry.name}`);
    try {
      // Downscale + re-encode before /vision to cap token usage.
      const payload = await downscaleImage(entry.dataUrl);
      epubLog(`image reader OCR payload b64=${entry.dataUrl.length}→${payload.length}`);
      const res = await fetch(`${PYTHON_API_URL}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: payload, prompt: IMAGE_OCR_PROMPT }),
      });
      const data = res.ok ? await res.json() : null;
      const md = typeof data?.response === 'string' ? data.response : '';
      const { title, body } = extractTitle(md);
      epubLog(`image reader OCR md length=${md.length} title=${title ?? '(none)'}`);
      epubLog(`image reader OCR sample: ${body.slice(0, 160).replace(/\n/g, ' ⏎ ')}`);
      setImages((prev) => prev.map((im) => (
        im.id === id
          ? { ...im, title: title ?? im.title, md: body, blocks: body ? parseMarkdown(body) : [], converting: false }
          : im
      )));
    } catch (err) {
      epubLog(`image reader OCR failed: ${(err as Error)?.message ?? err}`);
      setImages((prev) => prev.map((im) => (im.id === id ? { ...im, converting: false, error: true } : im)));
    }
  }, []);

  // After restore, OCR the current image if it has no result yet.
  useEffect(() => {
    if (!initialized) return;
    const cur = images.find((im) => im.id === currentId);
    if (cur && !cur.md && !cur.converting && !cur.error) void runOcr(cur);
  }, [initialized, currentId, images, runOcr]);

  // Keep a ref to `images` so selectImage can read the latest entry without the
  // callback identity changing on every render.
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

  // Saved-word context title: prefer the LLM title, then the file name.
  const ctx: Partial<SavedWordContext> = {
    textTitle: current?.title || current?.name || t('title.image_reader'),
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

  /** Placeholder "next image" tile below the last thumbnail. */
  const addTile = (
    <div className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-3 text-center">
      <Plus className="h-5 w-5 text-muted-foreground" />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Upload className="h-3 w-3" />
          {t('action.select_files')}
        </button>
        <button
          type="button"
          onClick={() => void pasteFromButton()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Clipboard className="h-3 w-3" />
          {t('action.paste')}
        </button>
      </div>
    </div>
  );

  // Loaded state: OCR'd reader (main) + right collapsible thumbnail sidebar.
  const loaded = images.length > 0;

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      <div className="mx-auto mb-4 flex w-full max-w-7xl items-center gap-3 px-4 pt-6">
        {/* Title — human-readable LLM title, then file name. */}
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">
          {current?.title || current?.name || t('title.image_reader')}
        </h1>
        {loaded && (
          <div className="flex items-center gap-1">
            {/* Sidebar toggle — mobile: opens the slide-in sheet */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('action.show_sidebar')}
            >
              <PanelRight className="h-5 w-5" />
            </button>
            {/* Sidebar toggle — desktop: collapses the persistent panel */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="hidden lg:flex flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
            >
              {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
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
        <p className="mx-auto mb-3 w-full max-w-7xl px-4 text-xs text-destructive">{notice}</p>
      )}

      {!loaded ? (
        /* Clamp the empty drop zone to the content container (logo → avatar)
           and leave a bottom margin so it doesn't hug the viewport edge. */
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-6">
          {dropZone}
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 gap-4 px-4 pb-6">
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

          {/* Thumbnail sidebar — right, collapsible (standard Sidebar). */}
          <Sidebar
            open={mobileSidebarOpen}
            onOpenChange={setMobileSidebarOpen}
            sidebarOpen={sidebarOpen}
            title={t('label.images')}
            desktopClassName="w-60 ml-3"
            bodyClassName="p-4"
          >
            <div className="flex flex-col items-center gap-3">
              {images.map((im) => (
                <div
                  key={im.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Clicking the current image opens its full-size preview;
                    // clicking another image selects it.
                    if (im.id === currentId) {
                      setPreviewId(im.id);
                    } else {
                      selectImage(im.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (im.id === currentId) setPreviewId(im.id);
                    else selectImage(im.id);
                  }}
                  className={`group relative w-full cursor-pointer overflow-hidden rounded-lg border-2 transition-colors ${
                    im.id === currentId ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* Retain the image's original aspect ratio (no forced 3:2 crop). */}
                  <img src={im.dataUrl} alt={im.title || im.name} className="block w-full h-auto" />
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
              {addTile}
            </div>
          </Sidebar>
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

      {/* Full-size image preview — click to zoom in/out, Ctrl+wheel/pinch to zoom. */}
      <Dialog
        open={!!previewId}
        onOpenChange={(o) => { if (!o) setPreviewId(null); }}
      >
        <DialogContent className="p-0 sm:max-w-4xl" overlayClassName="z-[70]">
          <div className="h-[75vh] w-full">
            {previewEntry && (
              <ZoomableImage src={previewEntry.dataUrl} alt={previewEntry.title || previewEntry.name} />
            )}
          </div>
          <DialogTitle className="sr-only">
            {previewEntry?.title || previewEntry?.name || t('title.image_reader')}
          </DialogTitle>
        </DialogContent>
      </Dialog>
    </div>
  );
}
