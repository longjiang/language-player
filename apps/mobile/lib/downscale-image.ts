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
 */

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/** Longest-side cap (px) for images sent to DeepSeek Vision. */
export const IMAGE_OCR_MAX_DIM = 1600;
/** JPEG quality for photographic OCR payloads (PNG output is lossless). */
export const IMAGE_OCR_QUALITY = 0.9;

/** Downscale an image data URL, re-encoding as lossless PNG for PNG sources and
 *  as higher-quality JPEG otherwise. Never upscales; returns a smaller data URL
 *  for /vision. */
export async function downscaleImage(
  dataUrl: string,
  maxDim: number = IMAGE_OCR_MAX_DIM,
  quality: number = IMAGE_OCR_QUALITY,
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
    const longest = Math.max(dims.width, dims.height);
    const scale = longest > maxDim ? maxDim / longest : 1;
    const width = Math.max(1, Math.round(dims.width * scale));
    const height = Math.max(1, Math.round(dims.height * scale));

    // PNG-for-text: keep lossless PNG for PNG sources (sharp text, preserved
    // alpha); photographic JPEG sources re-encode as a higher-quality JPEG.
    // Token cost is flat for this model, so we optimize for pixel fidelity.
    const isPng = /^data:image\/png/i.test(dataUrl);
    const result = await ImageManipulator.manipulateAsync(
      tmpUri,
      [{ resize: { width, height } }],
      {
        format: isPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
        compress: quality,
      },
    );
    const outB64 = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mime = isPng ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${outB64}`;
  } finally {
    void FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
  }
}
