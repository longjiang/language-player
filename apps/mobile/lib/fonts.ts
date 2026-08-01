import { useFonts } from 'expo-font';

/**
 * Locally vendored Inter font files (SIL OFL 1.1 — see
 * assets/fonts/LICENSE_FONT). The same files are vendored in apps/web
 * (src/app/fonts/) because each bundler requires fonts inside its own app
 * directory (next/font/local rejects paths outside apps/web).
 * These are static weight files, so each weight is registered under its own
 * family name (Inter_400Regular, Inter_500Medium, ...). The Tailwind config
 * maps `font-medium` / `font-semibold` / `font-bold` to these families, and
 * expo-font's runtime loader keeps Expo Go working without any network fetch.
 *
 * If a new weight is needed, copy the matching TTF from
 * the @expo-google-fonts/inter npm package (or Google Fonts) into BOTH
 * assets/fonts/ (here) and apps/web/src/app/fonts/, register it here, and map
 * it in tailwind.config.js.
 */
const INTER_FONTS = {
  Inter_400Regular: require('@/assets/fonts/Inter_400Regular.ttf'),
  Inter_500Medium: require('@/assets/fonts/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@/assets/fonts/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@/assets/fonts/Inter_700Bold.ttf'),
} as const;

/**
 * Loads the vendored Inter fonts. Returns [loaded, error].
 * When loading fails the app falls back to system fonts rather than crashing.
 */
export function useAppFonts() {
  return useFonts(INTER_FONTS);
}
