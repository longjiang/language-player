'use client';

import { useSettingsContext } from '@/providers/settings-provider';
import { ZOOM_TO_REM } from '@/components/tokenized-text';

/**
 * Multiplier for the user's text-size setting (Settings → Display → Text Size).
 * Returns 1 at the default zoom (index 0), up to 2.25 at the largest (index 7).
 * Use it to scale supporting text — like L1 translations — alongside the
 * zoomed TokenizedText L2 text.
 */
export function useTextScale(): number {
  const { tokenizedText } = useSettingsContext();
  return ZOOM_TO_REM[tokenizedText.zoom] ?? 1;
}
