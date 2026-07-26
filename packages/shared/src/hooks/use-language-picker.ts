/**
 * Shared logic layer for the unified language picker (ADR-0017).
 *
 * Pure TypeScript — no JSX, no platform imports. Both web and mobile consume
 * this hook and provide their own `getName` callback for language-name
 * resolution.
 *
 * ADR: docs/adr/0017-unified-language-picker.md
 */

import { useState, useMemo, useCallback } from 'react';

// ── Types ─────────────────────────────────────

export interface UseLanguagePickerOptions {
  /** Initial L1 code. Defaults to 'en'. */
  initialL1?: string;
  /** Initial L2 code. */
  initialL2?: string;
  /** Platform-provided callback to resolve a language code to its localized name. */
  getName: (code: string) => string;
  /** All languages supported as L1. */
  supportedL1s: readonly string[];
  /** All languages supported as L2. */
  supportedL2s: readonly string[];
  /** Languages to show in the "popular" section. */
  popularLanguages: readonly string[];
  /** Label for the popular section (localized). Defaults to 'Popular'. */
  popularTitle?: string;
  /** Label for the all-languages section (localized). Defaults to 'All'. */
  allTitle?: string;
}

export interface LanguageSection {
  title: string;
  data: string[];
}

export interface UseLanguagePickerReturn {
  // State
  selectedL1: string | null;
  selectedL2: string | null;
  searchL1: string;
  searchL2: string;
  activeTab: 'l1' | 'l2';
  useTraditional: boolean;

  // Derived
  filteredL1: LanguageSection[];
  filteredL2: LanguageSection[];
  isReady: boolean;

  // Actions
  setSelectedL1: (code: string) => void;
  setSelectedL2: (code: string) => void;
  setSearchL1: (q: string) => void;
  setSearchL2: (q: string) => void;
  setActiveTab: (tab: 'l1' | 'l2') => void;
  setUseTraditional: (v: boolean) => void;
  handleConfirm: () => void;
}

// ── Filtering helper ──────────────────────────

function filterLanguages(
  allCodes: readonly string[],
  popularLanguages: readonly string[],
  search: string,
  getName: (code: string) => string,
  popularTitle: string,
  allTitle: string,
): LanguageSection[] {
  const q = search.toLowerCase();

  if (!q) {
    // No search: popular first, then rest
    const popularSet = new Set(popularLanguages);
    const popular = popularLanguages.filter((c) => allCodes.includes(c as any));
    const rest = allCodes.filter((c) => !popularSet.has(c as any));
    const sections: LanguageSection[] = [];
    if (popular.length > 0) {
      sections.push({ title: popularTitle, data: popular as string[] });
    }
    if (rest.length > 0) {
      sections.push({ title: allTitle, data: rest as string[] });
    }
    return sections;
  }

  // Searching: flat filtered list, no sections
  const results = allCodes.filter(
    (c) =>
      c.toLowerCase().includes(q) ||
      getName(c).toLowerCase().includes(q),
  );
  return [{ title: '', data: results as string[] }];
}

// ── Hook ──────────────────────────────────────

export function useLanguagePicker(options: UseLanguagePickerOptions): UseLanguagePickerReturn & {
  setSelectedL1: (code: string) => void;
  setSelectedL2: (code: string) => void;
  setSearchL1: (q: string) => void;
  setSearchL2: (q: string) => void;
  setActiveTab: (tab: 'l1' | 'l2') => void;
  setUseTraditional: (v: boolean) => void;
  handleConfirm: () => void;
} {
  const {
    getName,
    supportedL1s,
    supportedL2s,
    popularLanguages,
    popularTitle = 'Popular',
    allTitle = 'All',
    initialL1 = 'en',
    initialL2,
  } = options;

  const [selectedL1, _setSelectedL1] = useState<string | null>(initialL1);
  const [selectedL2, _setSelectedL2] = useState<string | null>(initialL2 ?? null);
  const [searchL1, setSearchL1] = useState('');
  const [searchL2, setSearchL2] = useState('');
  const [activeTab, setActiveTab] = useState<'l1' | 'l2'>('l1');
  const [useTraditional, _setUseTraditional] = useState(false);

  // ── Filtered lists ──

  const filteredL1 = useMemo(
    () =>
      filterLanguages(
        supportedL1s,
        popularLanguages,
        searchL1,
        getName,
        popularTitle,
        allTitle,
      ),
    [supportedL1s, popularLanguages, searchL1, getName, popularTitle, allTitle],
  );

  const filteredL2 = useMemo(
    () =>
      filterLanguages(
        supportedL2s,
        popularLanguages,
        searchL2,
        getName,
        popularTitle,
        allTitle,
      ),
    [supportedL2s, popularLanguages, searchL2, getName, popularTitle, allTitle],
  );

  // ── Derived ──

  const isReady = selectedL1 !== null && selectedL2 !== null;

  // ── Actions ──

  const setSelectedL1 = useCallback(
    (code: string) => {
      _setSelectedL1(code);
      // Auto-advance to L2 tab on narrow layout (ADR-0017)
      setActiveTab('l2');
    },
    [],
  );

  const setSelectedL2 = useCallback(
    (code: string) => {
      _setSelectedL2(code);
    },
    [],
  );

  const setUseTraditional = useCallback(
    (v: boolean) => {
      _setUseTraditional(v);
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    // No-op in the shared hook — the platform wrapper handles persistence
    // and navigation via the `onConfirm` callback passed to the component.
  }, []);

  return {
    selectedL1,
    selectedL2,
    searchL1,
    searchL2,
    activeTab,
    useTraditional,
    filteredL1,
    filteredL2,
    isReady,
    setSelectedL1,
    setSelectedL2,
    setSearchL1,
    setSearchL2,
    setActiveTab,
    setUseTraditional,
    handleConfirm,
  };
}
