#!/usr/bin/env node
/**
 * Programmatic redirect checker for SPEC-071.
 *
 * Sends plain HTTP requests (no browser) to every case in the redirect test
 * matrix and asserts the status code + Location header. Not an e2e test.
 *
 * Usage:
 *   node scripts/check-redirects.mjs
 *   REDIRECT_TEST_BASE_URL=https://language-player.netlify.app node scripts/check-redirects.mjs
 *   REDIRECT_TEST_BASE_URL=http://localhost:3000 node scripts/check-redirects.mjs
 *
 * Exit code 0 = all cases passed, 1 = one or more failures.
 */

const BASE_URL =
  process.env.REDIRECT_TEST_BASE_URL ?? 'https://language-player.netlify.app';

/** @type {Array<{name: string, path: string, kind: 'pass'|'alias'|'v2'|'none', expected?: string, status?: number}>} */
const CASES = [
  // ── Pass-through: web handles the route, no redirect ──
  { name: 'Explore', path: '/en/ja/explore', kind: 'pass', status: 200 },
  { name: 'Dictionary', path: '/en/ja/dictionary', kind: 'pass', status: 200 },
  { name: 'Watch', path: '/en/ja/watch/Qgzv_LBictg', kind: 'pass', status: 200 },
  { name: 'Reader', path: '/en/ja/reader', kind: 'pass', status: 200 },
  { name: 'My Channels', path: '/en/ja/my-channels', kind: 'pass', status: 200 },

  // ── Internal 308 redirects (stay on web) ──
  { name: 'Explore Media', path: '/en/ja/explore-media', kind: 'alias', expected: '/en/ja/explore' },
  { name: 'My Playlists', path: '/en/ja/my-playlists', kind: 'alias', expected: '/en/ja/playlists' },
  { name: 'Playlist detail', path: '/en/ja/playlist/42', kind: 'alias', expected: '/en/ja/playlists/42' },
  { name: 'Saved Words Games', path: '/en/ja/saved-words-games', kind: 'alias', expected: '/en/ja/review' },
  { name: 'YouTube Likes', path: '/en/ja/youtube/likes', kind: 'alias', expected: '/en/ja/liked-videos' },
  { name: 'YouTube History', path: '/en/ja/youtube/history', kind: 'alias', expected: '/en/ja/watch-history' },
  { name: 'Channel directory', path: '/en/ja/youtube/channels', kind: 'alias', expected: '/en/ja/channels' },
  { name: 'Subscribed channels', path: '/en/ja/youtube/subscriptions', kind: 'alias', expected: '/en/ja/my-channels' },
  { name: 'YouTube Import', path: '/en/ja/youtube/import', kind: 'alias', expected: '/en/ja/search' },
  { name: 'My Text', path: '/en/ja/my-text', kind: 'alias', expected: '/en/ja/reader' },
  { name: 'Recommended Video', path: '/en/ja/recommended-video', kind: 'alias', expected: '/en/ja/explore' },
  { name: 'Saved Phrases', path: '/en/ja/saved-phrases', kind: 'alias', expected: '/en/ja/saved-words' },
  { name: 'Channel', path: '/en/ja/youtube/channel/UC123', kind: 'alias', expected: '/en/ja/channel/UC123' },
  { name: 'Video view (path id)', path: '/en/ja/video-view/youtube/abc123', kind: 'alias', expected: '/en/ja/watch/abc123' },
  {
    name: 'Video view (?v=)',
    path: '/en/ja/video-view/youtube?v=Qgzv_LBictg&p=recommended',
    kind: 'alias',
    expected: '/en/ja/watch/Qgzv_LBictg?queueType=recommended',
  },
  { name: 'Bring your own', path: '/en/ja/video-view/bring-your-own', kind: 'alias', expected: '/en/ja/local-media' },
  { name: 'Dictionary deep link', path: '/en/ja/dictionary/edict/92130', kind: 'alias', expected: '/en/ja/dictionary/entry/edict/92130' },
  { name: 'Reader shared', path: '/en/ja/reader/shared/42', kind: 'alias', expected: '/en/ja/reader?noteId=42' },
  { name: 'Dashboard', path: '/dashboard', kind: 'alias', expected: '/language-select' },
  { name: 'Verify email', path: '/verify-email?email=a%40b.com', kind: 'alias', expected: '/register?verifyEmail=a%40b.com' },
  { name: 'Delete account', path: '/delete-account', kind: 'alias', expected: '/en/zh/profile' },

  // ── Classic-only: 307 → v2 ──
  { name: 'Books', path: '/en/ja/books', kind: 'v2', expected: '/en/ja/books' },
  { name: 'Pinyin Chart', path: '/en/ja/chinese/pinyin-chart', kind: 'v2', expected: '/en/zh/chinese/pinyin-chart' },
  { name: 'Characters', path: '/en/ja/chinese/characters', kind: 'v2', expected: '/en/zh/chinese/characters' },
  { name: 'Explore Related', path: '/en/ja/chinese/explore-related', kind: 'v2', expected: '/en/zh/chinese/explore-related' },
  { name: 'Explore Roots', path: '/en/ja/chinese/explore-roots/123', kind: 'v2', expected: '/en/zh/chinese/explore-roots/123' },
  { name: 'Explore Topics', path: '/en/ja/chinese/explore-topics', kind: 'v2', expected: '/en/zh/chinese/explore-topics' },
  { name: 'Idioms', path: '/en/ja/chinese/idioms', kind: 'v2', expected: '/en/zh/chinese/idioms' },
  { name: 'Chinese Lesson Videos', path: '/en/ja/chinese/lesson-videos', kind: 'v2', expected: '/en/zh/chinese/lesson-videos' },
  { name: 'Lookup By Tones', path: '/en/ja/chinese/lookup-by-tones', kind: 'v2', expected: '/en/zh/chinese/lookup-by-tones' },
  { name: 'New Levels', path: '/en/ja/chinese/new-levels', kind: 'v2', expected: '/en/zh/chinese/new-levels' },
  { name: 'Chinese New Levels Graphic', path: '/en/ja/chinese/new-levels-graphic', kind: 'v2', expected: '/en/zh/explore/new-levels-graphic' },
  { name: 'Pinyin Squared', path: '/en/ja/chinese/pinyin-squared', kind: 'v2', expected: '/en/zh/chinese/pinyin-squared' },
  { name: 'Radicals', path: '/en/ja/chinese/radicals', kind: 'v2', expected: '/en/zh/chinese/radicals' },
  { name: 'Chinese Separable', path: '/en/ja/chinese/separable', kind: 'v2', expected: '/en/zh/chinese/separable' },
  { name: 'Pinyin List', path: '/en/ja/pinyin-list', kind: 'v2', expected: '/en/zh/pinyin-list' },
  { name: 'Lesson Videos', path: '/en/ja/lesson-videos', kind: 'v2', expected: '/en/zh/lesson-videos' },
  { name: 'Lesson Videos with level', path: '/en/ja/lesson-videos/1/2', kind: 'v2', expected: '/en/zh/lesson-videos/1/2' },
  { name: 'Separable', path: '/en/ja/separable/foo', kind: 'v2', expected: '/en/zh/separable/foo' },
  { name: 'New Levels Graphic', path: '/en/ja/explore/new-levels-graphic', kind: 'v2', expected: '/en/zh/explore/new-levels-graphic' },
  { name: 'Contact', path: '/en/ja/contact-us', kind: 'v2', expected: '/en/ja/contact-us' },
  { name: 'Languages', path: '/languages', kind: 'v2', expected: '/languages' },
  { name: 'HSK lookup', path: '/en/ja/dictionary/hsk/123', kind: 'v2', expected: '/en/zh/dictionary/hsk/123' },
  { name: 'Admin QA', path: '/admin/quality-assurance', kind: 'v2', expected: '/admin/quality-assurance' },

  // ── No redirect: web 404 / unchanged ──
  { name: 'Unknown route', path: '/en/ja/definitely-not-a-route', kind: 'none', status: 404 },
  { name: 'Invalid pair', path: '/xx/yy/books', kind: 'none', status: 404 },
];

function normalizeLocation(location, baseUrl) {
  if (!location) return null;
  try {
    return new URL(location, baseUrl);
  } catch {
    return null;
  }
}

async function checkCase(testCase) {
  const url = new URL(testCase.path, BASE_URL);
  let res;
  try {
    res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'language-player-redirect-check' },
    });
  } catch (err) {
    return { ok: false, error: `request failed: ${err.message}` };
  }

  const location = normalizeLocation(res.headers.get('location'), BASE_URL);

  if (testCase.kind === 'pass' || testCase.kind === 'none') {
    const expectedStatus = testCase.status ?? 200;
    if (res.status !== expectedStatus) {
      return { ok: false, error: `status ${res.status}, expected ${expectedStatus}` };
    }
    if (location) {
      return { ok: false, error: `unexpected redirect to ${location.href}` };
    }
    return { ok: true };
  }

  if (testCase.kind === 'alias') {
    if (res.status !== 308) {
      return { ok: false, error: `status ${res.status}, expected 308` };
    }
    if (!location) {
      return { ok: false, error: 'missing Location header' };
    }
    const actual = location.pathname + location.search;
    if (actual !== testCase.expected) {
      return { ok: false, error: `redirected to ${actual}, expected ${testCase.expected}` };
    }
    return { ok: true };
  }

  if (testCase.kind === 'v2') {
    if (res.status !== 307) {
      return { ok: false, error: `status ${res.status}, expected 307` };
    }
    if (!location) {
      return { ok: false, error: 'missing Location header' };
    }
    if (location.host !== 'v2.languageplayer.io') {
      return { ok: false, error: `redirected to ${location.host}, expected v2.languageplayer.io` };
    }
    const actual = location.pathname + location.search;
    if (actual !== testCase.expected) {
      return { ok: false, error: `redirected to ${actual}, expected ${testCase.expected}` };
    }
    return { ok: true };
  }

  return { ok: false, error: `unknown kind ${testCase.kind}` };
}

let failures = 0;
for (const testCase of CASES) {
  const result = await checkCase(testCase);
  if (result.ok) {
    console.log(`  ✓ ${testCase.name} (${testCase.path})`);
  } else {
    failures += 1;
    console.error(`  ✗ ${testCase.name} (${testCase.path}) — ${result.error}`);
  }
}

console.log('');
if (failures === 0) {
  console.log(`All ${CASES.length} redirect checks passed against ${BASE_URL}`);
} else {
  console.error(`${failures}/${CASES.length} redirect checks failed against ${BASE_URL}`);
  process.exitCode = 1;
}
