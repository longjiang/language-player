/**
 * Responsive wrapper for the unified language picker (ADR-0017).
 *
 * Delegates to LanguagePickerNarrow (tab-based) or LanguagePickerWide
 * (bi-panel) based on screen width and variant prop.
 * Wires the shared useLanguagePicker hook to platform-specific callbacks
 * for persistence (SettingsContext for traditional, LanguageContext for
 * language pair).
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { SUPPORTED_L1S, CONTENT_L2S, POPULAR_L1S, POPULAR_L2S } from '@langplayer/shared';
import { useLanguagePicker, type UseLanguagePickerReturn } from '@langplayer/shared';
import { LanguagePickerNarrow } from './LanguagePickerNarrow';
import { LanguagePickerWide } from './LanguagePickerWide';

// ── Props ─────────────────────────────────────

export interface LanguagePickerProps {
  /** Initial L1 code. Defaults to 'en'. */
  initialL1?: string;
  /** Initial L2 code. */
  initialL2?: string;
  /** Called when user confirms a valid L1+L2 pair. */
  onConfirm: (l1: string, l2: string) => void;
  /** Called when user dismisses (for modal/header usage). */
  onDismiss?: () => void;
  /** Show the welcome title + subtitle (for onboarding). */
  showTitle?: boolean;
  /** Show a close/dismiss button (for dialog/header usage). */
  showClose?: boolean;
  /**
   * Rendering context.
   *
   * `'fullscreen'` — onboarding. Responsive: tabs on narrow (< 640px),
   *   bi-panel on wide. Full height available.
   * `'dialog'` — header language switcher. Always single-column with tabs
   *   regardless of screen width.
   *
   * Defaults to `'fullscreen'`.
   */
  variant?: 'fullscreen' | 'dialog';
}

// ── Component ─────────────────────────────────

export function LanguagePicker({
  initialL1 = 'en',
  initialL2,
  onConfirm,
  onDismiss,
  showTitle = false,
  showClose = false,
  variant = 'fullscreen',
}: LanguagePickerProps) {
  const t = useT();
  const { isSm } = useResponsive();
  const { setL1Lang, setL2Lang } = useLanguage();
  const { getL2, setUseTraditional } = useSettingsContext();

  // Platform-specific getName callback
  const getName = useCallback((code: string) => t('lang.' + code), [t]);

  // Shared hook
  const picker = useLanguagePicker({
    initialL1,
    initialL2,
    getName,
    supportedL1s: SUPPORTED_L1S,
    supportedL2s: CONTENT_L2S,
    popularL1s: POPULAR_L1S,
    popularL2s: POPULAR_L2S,
    popularTitle: t('msg.popular_languages'),
    allTitle: t('msg.all_languages'),
  });

  // Sync useTraditional from SettingsContext on mount or when L2 changes to zh
  useEffect(() => {
    if (picker.selectedL2 === 'zh') {
      const settings = getL2('zh');
      picker.setUseTraditional(settings?.display?.traditional ?? false);
    }
  }, [picker.selectedL2]);

  // Wrap onConfirm to persist languages + script preference
  const handleConfirm = useCallback(async () => {
    if (!picker.selectedL1 || !picker.selectedL2) return;

    // Persist Chinese script preference
    if (picker.selectedL2 === 'zh') {
      setUseTraditional('zh', picker.useTraditional);
    }

    // Persist language pair
    await setL1Lang(picker.selectedL1);
    await setL2Lang(picker.selectedL2);

    // Notify caller
    onConfirm(picker.selectedL1, picker.selectedL2);
  }, [picker.selectedL1, picker.selectedL2, picker.useTraditional, onConfirm, setL1Lang, setL2Lang, setUseTraditional]);

  // Dialog mode always uses narrow
  const isWide = variant !== 'dialog' && isSm;

  const narrowProps = {
    ...picker,
    onConfirm: handleConfirm,
    showTitle,
    showClose,
    onDismiss,
    getName,
    // In dialog mode the picker sizes to its content; `flex-1` collapses to a
    // sliver inside the centered Dialog.Content wrapper.
    containerClassName: variant === 'dialog' ? 'w-full bg-background' : undefined,
  };

  if (isWide) {
    return (
      <LanguagePickerWide
        {...picker}
        onConfirm={handleConfirm}
        showTitle={showTitle}
        getName={getName}
      />
    );
  }

  return <LanguagePickerNarrow {...narrowProps} />;
}
