/**
 * Responsive wrapper for the unified language picker (ADR-0017).
 *
 * Delegates to LanguagePickerNarrow (tab-based) or LanguagePickerWide
 * (bi-panel) based on screen width and variant prop.
 * Wires the shared useLanguagePicker hook to platform-specific callbacks
 * for persistence (SettingsContext for traditional, LanguageContext for
 * language pair).
 */

'use client';

import React, { useCallback, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { SUPPORTED_L1S, SUPPORTED_L2S, POPULAR_LANGUAGES, useLanguagePicker } from '@langplayer/shared';
import { languageName } from '@/lib/language-data';
import { LanguagePickerNarrow } from '@/components/language-picker-narrow';
import { LanguagePickerWide } from '@/components/language-picker-wide';

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

// ── Breakpoint ────────────────────────────────

const SM_BREAKPOINT = 640;

// ── Component ─────────────────────────────────

export function LanguagePicker({
  initialL1 = 'en',
  initialL2 = '',
  onConfirm,
  onDismiss,
  showTitle = false,
  showClose = false,
  variant = 'fullscreen',
}: LanguagePickerProps) {
  const locale = useLocale();
  const t = useT();
  const { getL2, updateL2 } = useSettingsContext();

  // Platform-specific getName callback
  const getName = useCallback(
    (code: string) => languageName(code, locale),
    [locale],
  );

  // Shared hook
  const picker = useLanguagePicker({
    initialL1,
    initialL2: initialL2 || undefined,
    getName,
    supportedL1s: SUPPORTED_L1S,
    supportedL2s: SUPPORTED_L2S,
    popularLanguages: POPULAR_LANGUAGES,
    popularTitle: t('msg.popular_languages'),
    allTitle: t('msg.all_languages'),
  });

  // Sync traditional script preference from SettingsContext on mount / L2 change
  useEffect(() => {
    if (picker.selectedL2 === 'zh') {
      const settings = getL2('zh');
      picker.setUseTraditional(settings?.display?.traditional ?? false);
    }
  }, [picker.selectedL2]);

  // Wrap onConfirm to persist languages + script preference
  const handleConfirm = useCallback(() => {
    if (!picker.selectedL1 || !picker.selectedL2) return;

    // Persist Chinese script preference
    if (picker.selectedL2 === 'zh') {
      const current = getL2('zh');
      updateL2('zh', { display: { ...current.display, traditional: picker.useTraditional } });
    }

    // Notify caller
    onConfirm(picker.selectedL1, picker.selectedL2);
  }, [picker.selectedL1, picker.selectedL2, picker.useTraditional, onConfirm, getL2, updateL2]);

  // Detect screen width for responsive layout
  const [isWide, setIsWide] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsWide(window.innerWidth >= SM_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Dialog mode always uses narrow; fullscreen uses responsive
  const useWide = variant !== 'dialog' && isWide;

  // Avoid hydration mismatch: render nothing until mounted
  if (!mounted) {
    return <div className="w-full" />;
  }

  const narrowProps = {
    ...picker,
    onConfirm: handleConfirm,
    showTitle,
    showClose,
    onDismiss,
    getName,
  };

  if (useWide) {
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
