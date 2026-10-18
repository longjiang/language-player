'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isLoaded as isFontLoaded, loadAsync as loadFontAsync } from 'expo-font';
import { Directory, File, Paths } from 'expo-file-system';
import {
  collectRareCodePoints,
  rareFontFamily,
  rareGlyphParam,
  type RareGlyphManifest,
  type RareGlyphStyle,
} from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { log, logwarn } from '@/lib/logger';

/**
 * Rare-Han subset loader for mobile (SPEC-104).
 *
 * Downloads the smallest TTF/OTF subset the server can produce, caches it in
 * the app cache, and registers it with expo-font. Anything missing or failed
 * is rendered as a `RareGlyphChip` by the text components.
 */

interface RareGlyphContextValue {
  familyFor: (cp: number) => string | undefined;
  missing: ReadonlySet<number>;
  request: (cps: readonly number[]) => void;
  style: RareGlyphStyle;
}

const RareGlyphContext = createContext<RareGlyphContextValue | null>(null);

const MAX_BATCH = 256;
const DEBOUNCE_MS = 100;
const FONT_DIR = 'glyph-fonts';

const manifestCache = new Map<string, Promise<RareGlyphManifest>>();
const fontCache = new Map<string, Promise<string | null>>();

function parseHexList(values: readonly string[]): number[] {
  return values
    .map((value) => parseInt(value, 16))
    .filter((cp) => Number.isFinite(cp));
}

async function fetchManifest(
  style: RareGlyphStyle,
  cps: number[],
): Promise<RareGlyphManifest> {
  const key = `${style}:${rareGlyphParam(cps)}`;
  const cached = manifestCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const url =
      `${PYTHON_API_URL.replace(/\/+$/, '')}/glyph-font/manifest` +
      `?cps=${encodeURIComponent(rareGlyphParam(cps))}&style=${style}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`glyph-font manifest HTTP ${response.status}`);
    }
    return (await response.json()) as RareGlyphManifest;
  })();

  manifestCache.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    manifestCache.delete(key);
    throw error;
  }
}

async function ensureFont(
  style: RareGlyphStyle,
  manifest: RareGlyphManifest,
): Promise<string | null> {
  if (!manifest.hash) return null;
  const family = rareFontFamily(manifest.hash);
  const key = `${style}:${family}`;
  const cached = fontCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    if (isFontLoaded(family)) return family;

    const entry = manifest.fonts.ttf ?? manifest.fonts.otf;
    if (!entry) throw new Error('glyph-font manifest has no mobile font');
    const ext = entry.url.toLowerCase().endsWith('.otf') ? 'otf' : 'ttf';

    const dir = new Directory(Paths.cache, FONT_DIR);
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `${manifest.hash}.${ext}`);
    if (!file.exists || (file.size ?? 0) === 0) {
      const absolute = /^https?:\/\//i.test(entry.url)
        ? entry.url
        : `${PYTHON_API_URL.replace(/\/+$/, '')}${entry.url}`;
      await File.downloadFileAsync(absolute, file, { idempotent: true });
    }

    await loadFontAsync({ [family]: { uri: file.uri } });
    log(
      `[LP Mobile] rare-glyph loaded style=${style} hash=${manifest.hash} ` +
        `covered=${manifest.covered.length} bytes=${file.size ?? entry.bytes ?? 0}`,
    );
    return family;
  })();

  fontCache.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    fontCache.delete(key);
    throw error;
  }
}

export function RareGlyphProvider({ children }: { children: React.ReactNode }) {
  const { tokenizedText } = useSettingsContext();
  const style: RareGlyphStyle = tokenizedText.typeFace === 'serif' ? 'serif' : 'sans';

  const [families, setFamilies] = useState<Record<number, string>>({});
  const [missing, setMissing] = useState<ReadonlySet<number>>(() => new Set());

  const familiesRef = useRef<Record<number, string>>({});
  const missingRef = useRef<Set<number>>(new Set());
  const pendingRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const styleRef = useRef(style);
  styleRef.current = style;
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, DEBOUNCE_MS);
  }, []);

  const flush = useCallback(async () => {
    if (runningRef.current) {
      schedule();
      return;
    }
    runningRef.current = true;
    try {
      while (pendingRef.current.size > 0) {
        const requestStyle = styleRef.current;
        const allPending = [...pendingRef.current];
        pendingRef.current.clear();
        const unknown = allPending.filter(
          (cp) => !familiesRef.current[cp] && !missingRef.current.has(cp),
        );
        const batch = unknown.slice(0, MAX_BATCH);
        for (const cp of unknown.slice(MAX_BATCH)) pendingRef.current.add(cp);
        if (batch.length === 0) continue;

        try {
          const manifest = await fetchManifest(requestStyle, batch);
          if (styleRef.current !== requestStyle) continue;

          const nextFamilies = { ...familiesRef.current };
          const nextMissing = new Set(missingRef.current);
          const family =
            manifest.covered.length > 0 ? await ensureFont(requestStyle, manifest) : null;
          if (styleRef.current !== requestStyle) continue;

          if (family) {
            for (const hex of manifest.covered) {
              nextFamilies[parseInt(hex, 16)] = family;
            }
          } else {
            for (const hex of manifest.covered) nextMissing.add(parseInt(hex, 16));
          }
          for (const hex of manifest.missing) nextMissing.add(parseInt(hex, 16));

          familiesRef.current = nextFamilies;
          missingRef.current = nextMissing;
          setFamilies(nextFamilies);
          setMissing(nextMissing);
        } catch (error) {
          const nextMissing = new Set(missingRef.current);
          for (const cp of batch) nextMissing.add(cp);
          missingRef.current = nextMissing;
          setMissing(nextMissing);
          logwarn(
            `[LP Mobile] rare-glyph load failed style=${requestStyle} cps=${batch.length}: ${
              (error as Error)?.message ?? error
            }`,
          );
        }
      }
    } finally {
      runningRef.current = false;
      if (pendingRef.current.size > 0) schedule();
    }
  }, [schedule]);

  flushRef.current = flush;

  const request = useCallback(
    (cps: readonly number[]) => {
      let added = false;
      for (const cp of cps) {
        if (familiesRef.current[cp] || missingRef.current.has(cp) || pendingRef.current.has(cp)) {
          continue;
        }
        pendingRef.current.add(cp);
        added = true;
      }
      if (added) schedule();
    },
    [schedule],
  );

  const previousStyleRef = useRef(style);
  useEffect(() => {
    if (previousStyleRef.current === style) return;
    previousStyleRef.current = style;
    familiesRef.current = {};
    missingRef.current = new Set();
    pendingRef.current.clear();
    setFamilies({});
    setMissing(new Set());
  }, [style]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const familyFor = useCallback((cp: number) => familiesRef.current[cp], []);
  const value = useMemo<RareGlyphContextValue>(
    () => ({ familyFor, missing, request, style }),
    [familyFor, missing, request, style],
  );

  return <RareGlyphContext.Provider value={value}>{children}</RareGlyphContext.Provider>;
}

export function useRareGlyphState(text: string) {
  const context = useContext(RareGlyphContext);
  const cps = useMemo(() => collectRareCodePoints(text), [text]);
  const key = cps.join(',');

  useEffect(() => {
    if (cps.length > 0) context?.request(cps);
    // `key` captures the codepoint set; the array identity is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, context?.request, context?.style]);

  return {
    familyFor: context?.familyFor,
    missing: context?.missing,
    style: context?.style,
  };
}
