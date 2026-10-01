/**
 * Downscale + re-encode an image before sending it to DeepSeek Vision (mobile).
 *
 * DeepSeek Vision resizes every image to a ~800x800 pixel budget and caps each
 * image at ~384 input tokens, so image token cost is flat regardless of the
 * resolution you send. That means we don't optimize for payload size — we
 * optimize for the pixels the model actually reads. This writes the base64 to a
 * cache file, caps the longest side at IMAGE_OCR_MAX_DIM, keeps text/screenshot
 * PNG sources lossless (PNG-for-text: sharp text, preserved alpha), and
 * re-encodes photographic JPEG sources at a higher quality. The original data
 * URL is untouched — thumbnails/preview keep full resolution.
 *
 * One hard limit overrides that fidelity preference: the production API's front
 * end silently drops a request body of roughly 2.5 MiB or more. A `/vision`
 * POST that big answers `400 {"message":"Missing image (base64 data URL)"}` —
 * the truncated body never parses as JSON, so the handler sees no image at all
 * — while the local Flask server accepts the same request at any size. That is
 * why OCR worked in Debug (localhost) and not in Release (production) for
 * large screenshots. So the encoded data URL must stay under
 * IMAGE_OCR_MAX_PAYLOAD_BYTES: when the preferred encoding blows the budget we
 * step down (same size as JPEG, then progressively smaller JPEGs) and return
 * the smallest payload produced. See SPEC-090 § Vision pipeline.
 */

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { log } from '@/lib/logger';

/** Longest-side cap (px) for images sent to DeepSeek Vision. */
export const IMAGE_OCR_MAX_DIM = 1600;
/** JPEG quality for photographic OCR payloads (PNG output is lossless). */
export const IMAGE_OCR_QUALITY = 0.9;
/** Hard ceiling for the encoded `data:` URL handed to `/vision`. The measured
 *  production ceiling is ~2.5 MiB for the whole JSON body (see the note above);
 *  2 MB leaves room for the prompt and the JSON envelope. */
export const IMAGE_OCR_MAX_PAYLOAD_BYTES = 2_000_000;
/** Longest-side floor while stepping down to fit the payload budget. */
export const IMAGE_OCR_MIN_DIM = 800;
/** Last-resort JPEG quality tried at the size floor. */
export const IMAGE_OCR_FLOOR_QUALITY = 0.6;

/** One encode attempt in the payload ladder. */
interface Attempt {
  width: number;
  height: number;
  format: ImageManipulator.SaveFormat;
  compress: number;
}

/** Build the encode ladder for one image: preferred encoding at the cap first,
 *  then JPEG at the cap (PNG-for-text is a preference, not a promise), then
 *  progressively smaller JPEGs down to the size floor. */
function buildAttempts(
  srcW: number,
  srcH: number,
  maxDim: number,
  preferPng: boolean,
  quality: number,
): Attempt[] {
  const longest = Math.max(srcW, srcH);
  const attempts: Attempt[] = [];
  const push = (dim: number, format: ImageManipulator.SaveFormat, compress: number) => {
    const scale = Math.min(1, dim / longest);
    attempts.push({
      width: Math.max(1, Math.round(srcW * scale)),
      height: Math.max(1, Math.round(srcH * scale)),
      format,
      compress,
    });
  };

  const cap = Math.min(longest, maxDim);
  push(cap, preferPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG, quality);
  if (preferPng) push(cap, ImageManipulator.SaveFormat.JPEG, quality);

  let dim = cap;
  while (dim > IMAGE_OCR_MIN_DIM) {
    dim = Math.max(IMAGE_OCR_MIN_DIM, Math.round(dim * 0.75));
    push(dim, ImageManipulator.SaveFormat.JPEG, quality);
  }
  push(dim, ImageManipulator.SaveFormat.JPEG, IMAGE_OCR_FLOOR_QUALITY);
  return attempts;
}

/** Downscale an image data URL, re-encoding as lossless PNG for PNG sources and
 *  as higher-quality JPEG otherwise, stepping the encoding down until the data
 *  URL fits `maxBytes`. Never upscales; returns the payload to send to
 *  `/vision`. */
export async function downscaleImage(
  dataUrl: string,
  maxDim: number = IMAGE_OCR_MAX_DIM,
  quality: number = IMAGE_OCR_QUALITY,
  maxBytes: number = IMAGE_OCR_MAX_PAYLOAD_BYTES,
): Promise<string> {
  const base64 = dataUrl.split(',')[1] ?? '';
  if (!base64) return dataUrl;

  // Write the source to a cache file so the native module can read it.
  const tmpUri = `${FileSystem.cacheDirectory}downscale_${Date.now()}.img`;
  await FileSystem.writeAsStringAsync(tmpUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(tmpUri, (width, height) => resolve({ width, height }), reject);
    });

    const attempts = buildAttempts(
      dims.width,
      dims.height,
      maxDim,
      /^data:image\/png/i.test(dataUrl),
      quality,
    );

    let smallest: string | null = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]!;
      const result = await ImageManipulator.manipulateAsync(
        tmpUri,
        [{ resize: { width: attempt.width, height: attempt.height } }],
        { format: attempt.format, compress: attempt.compress },
      );
      let encoded: string;
      try {
        const outB64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const mime = attempt.format === ImageManipulator.SaveFormat.PNG ? 'image/png' : 'image/jpeg';
        encoded = `data:${mime};base64,${outB64}`;
      } finally {
        void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
      }

      // Diagnostics: which attempt, at what size/format, and whether it fits.
      log(
        `[image-reader] OCR payload attempt ${i + 1}/${attempts.length} `
        + `${attempt.width}x${attempt.height} ${attempt.format} q=${attempt.compress} `
        + `bytes=${encoded.length} budget=${maxBytes} fits=${encoded.length <= maxBytes}`,
      );

      if (encoded.length <= maxBytes) return encoded;
      if (!smallest || encoded.length < smallest.length) smallest = encoded;
    }

    // Nothing fit: hand back the smallest payload rather than nothing at all —
    // the OCR call may still get through, and the caller logs its size.
    log(`[image-reader] OCR payload over budget at the size floor — sending ${smallest?.length ?? 0} bytes`);
    return smallest ?? dataUrl;
  } finally {
    void FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
  }
}
