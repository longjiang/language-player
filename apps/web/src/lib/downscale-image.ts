/**
 * Downscale + re-encode an image before sending it to DeepSeek Vision.
 *
 * The `/vision` endpoint charges per image region, so sending a huge photo
 * as-is wastes tokens and adds latency. This caps the longest side and
 * re-encodes to JPEG (preserving PNG for transparent images), producing a far
 * smaller payload without meaningfully hurting OCR for typical text/diagram
 * images. The source data URL is left untouched — thumbnails/preview still use
 * the full-resolution original.
 */

/** Longest-side cap (px) for images sent to DeepSeek Vision. */
export const IMAGE_OCR_MAX_DIM = 1600;
/** JPEG re-encode quality for the OCR payload. */
export const IMAGE_OCR_QUALITY = 0.82;

/** True when >1% of the canvas pixels are not fully opaque (transparency). */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  let translucent = 0;
  const threshold = Math.max(1, Math.floor((width * height) * 0.01));
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 255) {
      translucent += 1;
      if (translucent > threshold) return true;
    }
  }
  return false;
}

/** Downscale an image data URL, re-encoding to JPEG (or PNG if it has
 *  transparency). Never upscales; returns a smaller data URL for /vision. */
export async function downscaleImage(
  dataUrl: string,
  maxDim: number = IMAGE_OCR_MAX_DIM,
  quality: number = IMAGE_OCR_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || img.width;
        const h0 = img.naturalHeight || img.height;
        const longest = Math.max(w0, h0);
        const scale = longest > maxDim ? maxDim / longest : 1;
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const isJpeg = /^data:image\/jpeg/i.test(dataUrl);
        const transparent = !isJpeg && hasTransparency(ctx, w, h);
        const type = transparent ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, quality));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });
}
