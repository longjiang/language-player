import { Image } from 'react-native';

/**
 * App-relative image paths that ship INSIDE the app bundle.
 *
 * Sample content (`@langplayer/shared/sample-content/*`) is authored once for
 * both apps and references images with web-root paths (e.g. `![travel](/travel.png)`),
 * which apps/web serves from `public/`. React Native cannot load those: a
 * `/travel.png` string is not a URL, a file path, nor a bundle asset, so
 * `Image.getSize()` fails and `<Image source={{ uri }}>` renders nothing.
 *
 * Every bundled path must be listed here so `resolveReaderImageSource()` can
 * map it to its Metro asset module (the same `require('@/assets/…')` pattern
 * the header logo uses). Keep this in sync with the images referenced by the
 * shared sample content.
 */
const BUNDLED_IMAGES: Record<string, number> = {
  '/travel.png': require('@/assets/travel.png'),
};

export interface ReaderImageSource {
  /** A URI React Native's `<Image>` and `Image.getSize()` can actually load. */
  uri: string;
  /** Intrinsic size, when known synchronously (bundled assets) — lets the
   *  caller size the box without waiting on `Image.getSize()`. */
  width?: number;
  height?: number;
}

/**
 * Resolve a markdown image URI for React Native: bundled app-relative paths
 * (`/travel.png`) become their Metro asset URI + intrinsic size, every other
 * URI (remote http(s), file://, data:, blob:) passes through untouched.
 */
export function resolveReaderImageSource(uri: string): ReaderImageSource {
  const assetModule = BUNDLED_IMAGES[uri];
  if (assetModule === undefined) return { uri };
  try {
    const asset = Image.resolveAssetSource(assetModule);
    if (asset?.uri) {
      return { uri: asset.uri, width: asset.width, height: asset.height };
    }
  } catch {
    // resolveAssetSource is unavailable outside the RN runtime (unit tests) —
    // fall back to the raw URI rather than crashing the reader.
  }
  return { uri };
}
