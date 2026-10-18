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
import {
  collectRareCodePoints,
  rareFontFamily,
  rareGlyphParam,
  type RareGlyphManifest,
  type RareGlyphStyle,
} from '@langplayer/shared';
import { useSettingsContext } from './settings-provider';
import { log, logwarn } from '@/lib/logger';

/**
 * Batch loader for rare-Han font subsets (SPEC-104).
 *
 * Components register the rare codepoints they are about to render. The
 * provider debounces them into one manifest request per batch, loads the
 * returned WOFF2 once, and exposes `familyFor(cp)` to the renderer. Anything
 * not covered or not loaded falls back to `RareGlyphChip`.
 */

interface RareGlyphContextValue {
  /** Loaded subset family for a codepoint, or undefined (render the chip). */
  familyFor: (cp: number) => string | undefined;
  /** Codepoints the source font cannot render. */
  missing: ReadonlySet<number>;
  /** Queue codepoints for loading (idempotent, batched). */
  request: (cps: readonly number[]) => void;
}

const RareGlyphContext = createContext<RareGlyphContextValue | null>(null);

const MAX_BATCH = 256;
const DEBOUNCE_MS = 100;

const manifestCache = new Map<string, Promise<RareGlyphManifest>>();
const fontCache = new Map<string, Promise<string>>();

function parseHexList(values: readonly string[]): number[] {
  return values
    .map((value) => parseInt(value, 16))
    .filter((cp) => Number.isFinite(cp));
}

async function fetchManifest(style: RareGlyphStyle, cps: number[]): Promise<RareGlyphManifest> {
  const key = `${style}:${rareGlyphParam(cps)}`;
  const cached = manifestCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const response = await fetch(
      `/api/glyph-font/manifest?cps=${encodeURIComponent(rareGlyphParam(cps))}&style=${style}`,
    );
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

async function loadFontFace(
  style: RareGlyphStyle,
  manifest: RareGlyphManifest,
): Promise<string | null> {
  if (!manifest.hash) return null;
  const family = rareFontFamily(manifest.hash);
  const key = `${style}:${family}`;
  const cached = fontCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const entry = manifest.fonts.woff2;
    if (!entry) throw new Error('glyph-font manifest has no woff2 font');
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`glyph-font HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const unicodeRange = parseHexList(manifest.covered)
      .map((cp) => `U+${cp.toString(16).toUpperCase()}`)
      .join(', ');
    const face = new FontFace(family, bytes, {
      display: 'swap',
      ...(unicodeRange ? { unicodeRange } : {}),
    });
    await face.load();
    document.fonts.add(face);
    log(
      `[LP Web] rare-glyph loaded style=${style} hash=${manifest.hash} ` +
        `covered=${manifest.covered.length} bytes=${bytes.byteLength}`,
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
            manifest.covered.length > 0 ? await loadFontFace(requestStyle, manifest) : null;
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
          // A failed manifest/font must not leave a blank: chip every
          // codepoint in this batch and retry on a later request.
          const nextMissing = new Set(missingRef.current);
          for (const cp of batch) nextMissing.add(cp);
          missingRef.current = nextMissing;
          setMissing(nextMissing);
          logwarn(
            `[LP Web] rare-glyph load failed style=${requestStyle} cps=${batch.length}: ${
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

  // The typeface setting changes the source font. Drop the loaded maps so the
  // next batch fetches the sans/serif variant; already-registered FontFaces
  // remain valid and are reused by hash.
  useEffect(() => {
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
    () => ({ familyFor, missing, request }),
    [familyFor, missing, request],
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
  }, [key, context?.request]);

  return {
    familyFor: context?.familyFor,
    missing: context?.missing,
  };
}
