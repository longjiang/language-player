/**
 * Downscale + re-encode an image before sending it to DeepSeek Vision (mobile).
 *
 * The `/vision` endpoint charges per image region, so a huge photo as-is wastes
 * tokens. This writes the base64 to a cache file, caps the longest side at
 * IMAGE_OCR_MAX_DIM, and re-encodes to JPEG, returning a smaller data URL. The
 * original data URL is untouched — thumbnails/preview keep full resolution.
 */

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/** Longest-side cap (px) for images sent to DeepSeek Vision. */
export const IMAGE_OCR_MAX_DIM = 1600;
/** JPEG re-encode quality for the OCR payload. */
export const IMAGE_OCR_QUALITY = 0.82;

/** Downscale an image data URL, re-encoding to JPEG. Never upscales. */
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

    const result = await ImageManipulator.manipulateAsync(
      tmpUri,
      [{ resize: { width, height } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: quality },
    );
    const outB64 = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${outB64}`;
  } finally {
    void FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
  }
}
