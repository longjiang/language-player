#!/usr/bin/env node
/**
 * Queries the recommendations engine for 4 popular videos per L2
 * and writes the result to apps/web/src/data/og-videos.json.
 *
 * Usage:
 *   node scripts/generate-og-cache.mjs                  # default languages
 *   node scripts/generate-og-cache.mjs --l2=en,ko,ja   # specific languages
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../apps/web/src/data/og-videos.json');

const PYTHON_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5001';

// Popular languages with YouTube caption support
const DEFAULT_L2S = [
  'en', 'es', 'zh', 'ja', 'ko', 'fr', 'de', 'pt', 'ru', 'ar',
  'hi', 'it', 'tr', 'vi', 'th', 'pl', 'nl', 'sv', 'no', 'fi',
];
const LIMIT = 4;

async function fetchVideos(l2) {
  try {
    const url = `${PYTHON_API_URL}/recommend-videos?l2=${l2}&limit=${LIMIT}`;
    process.stdout.write(`  ${l2} … `);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const videos = Array.isArray(data) ? data : data?.data ?? [];
    const ids = videos
      .map((v) => v.youtube_id)
      .filter(Boolean)
      .slice(0, LIMIT);
    console.log(`${ids.length} videos`);
    return ids;
  } catch (err) {
    console.warn(err.message);
    return [];
  }
}

async function main() {
  const argv = process.argv.find((a) => a.startsWith('--l2='));
  const l2s = argv
    ? argv.replace('--l2=', '').split(',')
    : DEFAULT_L2S;

  console.log(`Generating OG video cache for ${l2s.length} languages …\n`);

  const cache = {};
  for (const l2 of l2s) {
    const ids = await fetchVideos(l2);
    if (ids.length > 0) cache[l2] = ids;
    // Small delay between requests — don't hammer the backend
    await new Promise((r) => setTimeout(r, 300));
  }

  writeFileSync(OUT, JSON.stringify(cache, null, 2) + '\n');
  console.log(`\nDone — wrote ${Object.keys(cache).length} languages to ${OUT}`);
}

main().catch(console.error);
