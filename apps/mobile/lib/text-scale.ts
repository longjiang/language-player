import { useSettingsContext } from '@/contexts/SettingsContext';

/** User text-size zoom indexes → rem multipliers (matches apps/web). */
export const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/** Multiplier for the user's text-size setting (zoom index 0 = 1×). */
export function useTextScale(): number {
  const { tokenizedText } = useSettingsContext();
  return ZOOM_TO_REM[tokenizedText.zoom] ?? 1;
}
