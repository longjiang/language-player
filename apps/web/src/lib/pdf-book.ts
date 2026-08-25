'use client';

/**
 * Web PDF support via pdf.js (client-side). Renders page images (cover,
 * thumbnails, the page the vision model OCRs), the PDF outline (TOC), and
 * page counts. The reading content itself is produced by DeepSeek Vision
 * from a rendered page image (see POST /vision).
 */

import * as pdfjs from 'pdfjs-dist';
import { log, logwarn } from '@/lib/logger';

// ESM worker, bundled as an asset by Next.js.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface PdfOutlineItem {
  /** Outline entry label. */
  title: string;
  /** 1-based page number the entry points to. */
  page: number;
  children?: PdfOutlineItem[];
}

export interface PdfInfo {
  pageCount: number;
  /** Nested outline (bookmarks) — the PDF's table of contents. */
  outline: PdfOutlineItem[];
  /** Title from the PDF metadata, if any. */
  title?: string;
}

async function openDoc(data: ArrayBuffer) {
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    logwarn('[LP Web] PDF parse failed', (err as Error)?.message ?? err);
    throw err;
  }
}

/** Resolve an outline destination to a 1-based page number. */
async function destPage(
  doc: pdfjs.PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  try {
    const resolved = await doc.getDestination(dest as string);
    if (!Array.isArray(resolved) || resolved.length === 0) return null;
    const first = resolved[0] as { num?: number } | null;
    if (first && typeof first === 'object' && typeof first.num === 'number') {
      const idx = await doc.getPageIndex(first as never);
      return idx + 1;
    }
    return null;
  } catch {
    return null;
  }
}

/** The outline items pdf.js returns (not exported as a named type). */
type PdfOutlineRaw = {
  title: string;
  dest: unknown;
  items?: PdfOutlineRaw[];
};

async function walkOutline(
  doc: pdfjs.PDFDocumentProxy,
  items: PdfOutlineRaw[],
): Promise<PdfOutlineItem[]> {
  const out: PdfOutlineItem[] = [];
  for (const item of items) {
    const page = await destPage(doc, item.dest);
    const node: PdfOutlineItem = { title: item.title, page: page ?? 1 };
    if (item.items && item.items.length > 0) {
      node.children = await walkOutline(doc, item.items);
    }
    out.push(node);
  }
  return out;
}

/** Page count + outline + metadata title. */
export async function pdfInfo(data: ArrayBuffer): Promise<PdfInfo> {
  const doc = await openDoc(data);
  try {
    const [outline, meta] = await Promise.all([
      doc.getOutline(),
      doc.getMetadata().catch(() => null),
    ]);
    const info: PdfInfo = {
      pageCount: doc.numPages,
      outline: outline && outline.length > 0 ? await walkOutline(doc, outline) : [],
    };
    const md = (meta as { info?: { Title?: string } } | null)?.info;
    if (md?.Title) info.title = md.Title;
    return info;
  } finally {
    void doc.destroy();
  }
}

/** Render one page to a PNG data URL (the cover, thumbnails, vision input). */
export async function renderPdfPage(
  data: ArrayBuffer,
  pageNumber: number,
  scale = 1.5,
): Promise<string> {
  const doc = await openDoc(data);
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } finally {
    void doc.destroy();
  }
}

/**
 * Convert one rendered page image to markdown via DeepSeek Vision. Used by
 * the PDF reader when a page thumbnail is tapped. Results are cached
 * server-side by the /vision endpoint.
 */
export async function pdfPageToMarkdown(dataUrl: string): Promise<string> {
  const { PYTHON_API_URL } = await import('@/lib/api-url');
  const res = await fetch(`${PYTHON_API_URL}/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: dataUrl,
      prompt:
        'Extract all text from this PDF page image as clean markdown. ' +
        'Preserve headings, paragraphs, lists, bold/italic emphasis, and code ' +
        'blocks. Output only the markdown, with no commentary.',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { response?: string };
  log('[LP Web] pdf page → markdown', { chars: data.response?.length ?? 0 });
  return data.response ?? '';
}
