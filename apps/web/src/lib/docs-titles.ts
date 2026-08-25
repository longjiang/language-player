import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Server-only helpers for resolving `{$key}` placeholders in docs titles
 * against the l1's translation map (packages/shared/locales/{l1}.json,
 * written by scripts/sync-translations.mjs).
 *
 * Doc titles are stored two ways:
 *  - in packages/docs/i18n/{l1}.json entries (title field), which may keep
 *    raw `{$key}` placeholders (e.g. privacy-policy → `{$title.privacy_policy}`);
 *  - as the H1 of the raw .md fallback (same placeholder syntax).
 * Both must resolve to the l1's translated text so the docs TOC respects the
 * `?l1=` query instead of showing literal keys.
 */

function flatten(obj: Record<string, unknown>, prefix: string, out: Map<string, string>): void {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else if (v && typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
  }
}

/** key → translated value for the given l1 (falls back to en when the l1
 *  file is missing or empty). */
export function loadTranslationMap(l1: string): Map<string, string> {
  const map = new Map<string, string>();
  const tryLoad = (code: string): boolean => {
    try {
      const json = JSON.parse(
        readFileSync(resolve(process.cwd(), '../../packages/shared/locales', `${code}.json`), 'utf-8'),
      ) as Record<string, unknown>;
      flatten(json, '', map);
      return map.size > 0;
    } catch {
      return false;
    }
  };
  if (!tryLoad(l1)) tryLoad('en');
  return map;
}

/** Resolve `{$key}` placeholders in a title. Missing keys fall back to the
 *  bare key name (never the braced literal). */
export function resolveTitlePlaceholders(title: string, map: Map<string, string>): string {
  return title.replace(/\{\$([\w.]+)\}/g, (_, key: string) => map.get(key) ?? key);
}
