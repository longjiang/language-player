import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';

export type LanguagePair = { l1: string; l2: string };

export type RouteAction =
  | { kind: 'pass' }
  | { kind: 'alias'; path: string; dropSearchParams: string[] }
  | { kind: 'v2' };

interface AliasRule {
  pattern: string;
  to: (
    params: Record<string, string>,
    pair: LanguagePair,
    search: URLSearchParams,
  ) => string | null;
  /** Original query params that must not be copied onto the target URL. */
  dropSearchParams?: string[];
}

export const V2_ORIGIN =
  process.env.NEXT_PUBLIC_LEGACY_V2_ORIGIN ?? 'https://v2.languageplayer.io';

/**
 * Every path shape the web app can serve. Anything matching here must never
 * be redirected to v2. Kept as pattern strings so the audit tables in
 * SPEC-071 stay readable.
 */
const WEB_ROUTE_PATTERNS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/password-reset',
  '/go-pro-error',
  '/go-pro-success',
  '/language-select',
  '/logout',
  '/auth/confirm',
  '/auth/verified',
  '/:l1/:l2',
  '/:l1/:l2/channel/:channelId',
  '/:l1/:l2/channels',
  '/:l1/:l2/about',
  '/:l1/:l2/dictionary',
  '/:l1/:l2/dictionary/entry/:dictionaryId/:entryId',
  '/:l1/:l2/dictionary/word/:word',
  '/:l1/:l2/docs',
  '/:l1/:l2/docs/:slug+',
  '/:l1/:l2/epub',
  '/:l1/:l2/explore',
  '/:l1/:l2/go-pro',
  '/:l1/:l2/liked-videos',
  '/:l1/:l2/live-tv',
  '/:l1/:l2/local-media',
  '/:l1/:l2/music',
  '/:l1/:l2/my-channels',
  '/:l1/:l2/playlists',
  '/:l1/:l2/playlists/:playlistId',
  '/:l1/:l2/profile',
  '/:l1/:l2/reader',
  '/:l1/:l2/review',
  '/:l1/:l2/saved-words',
  '/:l1/:l2/search',
  '/:l1/:l2/settings',
  '/:l1/:l2/settings/display',
  '/:l1/:l2/settings/playback',
  '/:l1/:l2/settings/review',
  '/:l1/:l2/settings/search',
  '/:l1/:l2/settings/speech',
  '/:l1/:l2/tokenizer',
  '/:l1/:l2/tv-shows',
  '/:l1/:l2/tv-shows/:id',
  '/:l1/:l2/watch-history',
  '/:l1/:l2/watch/:videoId',
  '/:l1/:l2/web-reader',
];

/**
 * Classic routes whose feature exists in web under a different path.
 * `to` returns null when the Classic path has no meaningful web target
 * (e.g. a channel URL without a channel id); the matcher then falls through
 * to the Classic-only rules.
 */
const LEGACY_ALIASES: AliasRule[] = [
  {
    pattern: '/dashboard',
    to: () => '/language-select',
  },
  {
    pattern: '/delete-account',
    to: (_params, pair) => `/${pair.l1}/${pair.l2}/profile`,
  },
  {
    pattern: '/go-pro',
    to: (_params, pair) => `/${pair.l1}/${pair.l2}/go-pro`,
  },
  {
    pattern: '/privacy-policy',
    to: (_params, pair) => `/${pair.l1}/${pair.l2}/docs/privacy-policy`,
  },
  {
    pattern: '/verify-email',
    to: (_params, _pair, search) => {
      const email = search.get('email');
      if (email) {
        const query = new URLSearchParams({
          verifyEmail: decodeParam(email),
        }).toString();
        return `/register?${query}`;
      }
      return '/register';
    },
    dropSearchParams: ['email', 'code'],
  },
  {
    pattern: '/:l1/:l2/explore-media',
    to: (params) => `/${params.l1}/${params.l2}/explore`,
  },
  {
    pattern: '/:l1/:l2/my-playlists',
    to: (params) => `/${params.l1}/${params.l2}/playlists`,
  },
  {
    pattern: '/:l1/:l2/playlist/:id',
    to: (params) => `/${params.l1}/${params.l2}/playlists/${params.id}`,
  },
  {
    pattern: '/:l1/:l2/saved-words-games',
    to: (params) => `/${params.l1}/${params.l2}/review`,
  },
  {
    pattern: '/:l1/:l2/youtube/likes',
    to: (params) => `/${params.l1}/${params.l2}/liked-videos`,
  },
  {
    pattern: '/:l1/:l2/youtube/history',
    to: (params) => `/${params.l1}/${params.l2}/watch-history`,
  },
  {
    pattern: '/:l1/:l2/youtube/channels',
    to: (params) => `/${params.l1}/${params.l2}/channels`,
  },
  {
    pattern: '/:l1/:l2/youtube/subscriptions',
    to: (params) => `/${params.l1}/${params.l2}/my-channels`,
  },
  {
    pattern: '/:l1/:l2/youtube/search/:term?',
    to: (params) => {
      const base = `/${params.l1}/${params.l2}/search`;
      if (params.term === undefined) return base;
      const q = new URLSearchParams({ q: decodeParam(params.term) }).toString();
      return `${base}?${q}`;
    },
  },
  {
    pattern: '/:l1/:l2/youtube/import',
    to: (params) => `/${params.l1}/${params.l2}/search`,
  },
  {
    pattern: '/:l1/:l2/my-text',
    to: (params) => `/${params.l1}/${params.l2}/reader`,
  },
  {
    pattern: '/:l1/:l2/contact-us',
    to: (params) => `/${params.l1}/${params.l2}/about`,
  },
  {
    pattern: '/:l1/:l2/recommended-video',
    to: (params) => `/${params.l1}/${params.l2}/explore`,
  },
  {
    pattern: '/:l1/:l2/saved-phrases/:initId?',
    to: (params) => `/${params.l1}/${params.l2}/saved-words`,
  },
  {
    pattern: '/:l1/:l2/dictionary/:dictionaryId/:entryId',
    to: (params) => {
      // Classic's HSK-id lookup has no web equivalent — fall through to v2.
      if (params.dictionaryId === 'hsk') return null;
      if (params.entryId === 'random') {
        return `/${params.l1}/${params.l2}/dictionary`;
      }
      return `/${params.l1}/${params.l2}/dictionary/entry/${params.dictionaryId}/${params.entryId}`;
    },
  },
  {
    pattern: '/:l1/:l2/reader/shared',
    to: (params) => `/${params.l1}/${params.l2}/reader`,
  },
  {
    pattern: '/:l1/:l2/reader/shared/:id',
    to: (params) => {
      const id = params.id;
      if (id === undefined) return null;
      const query = new URLSearchParams({
        noteId: decodeParam(id),
      }).toString();
      return `/${params.l1}/${params.l2}/reader?${query}`;
    },
  },
  {
    pattern: '/:l1/:l2/reader/:method/:arg',
    to: (params) => {
      const method = params.method;
      const arg = params.arg;
      if (!method || !arg) return null;
      if (!['md', 'html', 'txt', 'md-url', 'html-url'].includes(method)) {
        return null;
      }
      const query = new URLSearchParams({
        method,
        arg: decodeParam(arg),
      }).toString();
      return `/${params.l1}/${params.l2}/reader?${query}`;
    },
  },
  {
    pattern: '/:l1/:l2/youtube/channel/:channelId?/:title?',
    to: (params) =>
      params.channelId === undefined
        ? null
        : `/${params.l1}/${params.l2}/channel/${params.channelId}`,
  },
  {
    pattern: '/:l1/:l2/video-view/:type/:videoId?/:dbId?/:lesson?',
    to: (params, _pair, search) => {
      const videoId = params.videoId ?? search.get('v');
      if (videoId) {
        const query = new URLSearchParams();
        const p = search.get('p');
        if (p === 'recommended' || p === 'recommended_music') {
          query.set('queueType', 'recommended');
        }
        const base = `/${params.l1}/${params.l2}/watch/${decodeParam(videoId)}`;
        const qs = query.toString();
        return qs ? `${base}?${qs}` : base;
      }
      if (params.type === 'bring-your-own') {
        return `/${params.l1}/${params.l2}/local-media`;
      }
      return null;
    },
    dropSearchParams: ['v', 'id', 'p', 'sort', 'lesson'],
  },
  {
    pattern: '/:l1/:l2/show/:type/:id',
    to: (params) => `/${params.l1}/${params.l2}/tv-shows/${params.id}`,
  },
];

const CLASSIC_CONTENT_SLUGS = [
  'authentic-language-learning',
  'business-language-videos',
  'choosing-authentic-video-content',
  'comprehensible-input-in-practice',
  'conversational-fluency-videos',
  'culture-insights-through-videos',
  'evolution-of-interactive-learning',
  'impact-of-authentic-content',
  'interactive-language-practice',
  'interactive-learning-videos',
  'interactive-video-case-studies',
  'interactive-video-techniques',
  'krashens-comprehensible-approach',
  'krashens-theory-in-action',
  'language-acquisition-research',
  'native-speaker-insights',
  'role-of-context-in-language',
  'role-of-interactive-video',
  'travel-language-interactive',
];

/**
 * Classic routes with no web equivalent. These redirect to v2 with the
 * original path and query string preserved.
 */
const CLASSIC_ONLY_PATTERNS = [
  // Root-level pages
  '/all-routes',
  '/articles',
  '/compare-languages/:rest*',
  '/discover-shows/:rest*',
  '/languages',
  '/language-map',
  '/language-icons',
  '/popular',
  '/stats',
  '/translators',
  '/phonological-features',
  '/admin/:rest+',
  '/textbooks-workbooks',
  ...CLASSIC_CONTENT_SLUGS.map((slug) => `/${slug}`),

  // Legacy external redirects handled by Classic's middleware
  '/:l1/:l2/textbooks-workbooks',
  '/:l1/:l2/online-courses',
  '/:l1/:l2/youtube/view/:rest+',

  // Language-pair pages without a web equivalent
  '/:l1/:l2/about',
  '/:l1/:l2/analytics',
  '/:l1/:l2/articles/reddit/:rest*',
  '/:l1/:l2/articles/wiki/:rest*',
  '/:l1/:l2/audiobooks/:rest*',
  '/:l1/:l2/book',
  '/:l1/:l2/book/chapter',
  '/:l1/:l2/book/list',
  '/:l1/:l2/books',
  '/:l1/:l2/bookshelf',
  '/:l1/:l2/library',
  '/:l1/:l2/categories',
  '/:l1/:l2/category/:slug',
  '/:l1/:l2/chinese/characters',
  '/:l1/:l2/chinese/explore-related',
  '/:l1/:l2/chinese/explore-roots/:arg',
  '/:l1/:l2/chinese/explore-topics',
  '/:l1/:l2/chinese/idioms',
  '/:l1/:l2/chinese/lesson-videos',
  '/:l1/:l2/chinese/lookup-by-tones',
  '/:l1/:l2/chinese/new-levels',
  '/:l1/:l2/chinese/new-levels-graphic',
  '/:l1/:l2/chinese/pinyin-chart',
  '/:l1/:l2/chinese/pinyin-squared',
  '/:l1/:l2/chinese/radicals',
  '/:l1/:l2/chinese/separable',
  '/:l1/:l2/community',
  '/:l1/:l2/compare/:method/:args',
  '/:l1/:l2/confirm-deletion',
  '/:l1/:l2/discussions',
  '/:l1/:l2/feed',
  '/:l1/:l2/faq',
  '/:l1/:l2/grammar',
  '/:l1/:l2/grammar/view/:id',
  '/:l1/:l2/gutenberg/:rest*',
  '/:l1/:l2/hindi/bookmarklet',
  '/:l1/:l2/klingon/keyboard',
  '/:l1/:l2/language-info',
  '/:l1/:l2/learn/:rest*',
  '/:l1/:l2/learning-path',
  '/:l1/:l2/levels',
  '/:l1/:l2/minimal-pairs',
  '/:l1/:l2/dictionary/hsk/:hskId',
  '/:l1/:l2/reader/:method/:arg',
  '/:l1/:l2/page/:id/:title?',
  '/:l1/:l2/phrase/compare/:term/:compareTerm',
  '/:l1/:l2/phrase/search/:term/:dict?',
  '/:l1/:l2/phrasebook/:bookId/:phraseId?/:phrase?',
  '/:l1/:l2/phrasebooks',
  '/:l1/:l2/pinyin-list',
  '/:l1/:l2/resource/list/:rest*',
  '/:l1/:l2/set-content-preferences',
  '/:l1/:l2/set-language-level',
  '/:l1/:l2/talks/:rest*',
  '/:l1/:l2/transcription',
  '/:l1/:l2/tutoring/:rest*',
  '/:l1/:l2/tutoring/lesson/:id',
  '/:l1/:l2/updates',
  '/:l1/:l2/youtube/browse/:category/:level/:locale/:start',
  '/:l1/:l2/youtube/playlist/:rest*',
  '/:l1/:l2/youtube/channel',
  '/:l1/:l2/video-view/:type',

  // Classic extendRoutes aliases with no web equivalent
  '/:l1/:l2/lesson-videos/:rest*',
  '/:l1/:l2/explore/new-levels-graphic',
  '/:l1/:l2/separable/:rest*',
  '/:l1/:l2/admin/assign-lesson-videos/:rest*',
];

const patternCache = new Map<string, RegExp>();

/**
 * Chinese-specific Classic routes are only meaningful with L2 = zh. When any
 * of these redirect to v2, the L2 segment is normalized to `zh` first
 * (e.g. `/en/ja/chinese/pinyin-chart` → `/en/zh/chinese/pinyin-chart`).
 */
const CHINESE_RELATED_PATTERNS = [
  /^\/[^/]+\/[^/]+\/chinese\//,
  /^\/[^/]+\/[^/]+\/pinyin-list(?:\/|$)/,
  /^\/[^/]+\/[^/]+\/dictionary\/hsk\//,
  /^\/[^/]+\/[^/]+\/separable(?:\/|$)/,
  /^\/[^/]+\/[^/]+\/lesson-videos(?:\/|$)/,
  /^\/[^/]+\/[^/]+\/explore\/new-levels-graphic(?:\/|$)/,
];

/** Path used for the v2 redirect; Chinese-related paths get L2 = zh. */
export function v2RedirectPath(pathname: string): string {
  // Both the legacy shared link (`/explore/new-levels-graphic`) and the
  // file-based route (`/chinese/new-levels-graphic`) point at the same
  // component; canonicalize both to `/explore/new-levels-graphic` with L2 = zh.
  if (
    /^\/[^/]+\/[^/]+\/(?:chinese|explore)\/new-levels-graphic(?:\/|$)/.test(
      pathname,
    )
  ) {
    return `/${pathname.split('/')[1] ?? 'en'}/zh/explore/new-levels-graphic`;
  }
  if (CHINESE_RELATED_PATTERNS.some((regex) => regex.test(pathname))) {
    const segments = pathname.split('/');
    if (segments.length >= 3) {
      segments[2] = 'zh';
    }
    return segments.join('/');
  }
  return pathname;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegExp(pattern: string): RegExp {
  if (pattern === '/') return /^\/$/;
  let source = '^';
  for (const segment of pattern.split('/').slice(1)) {
    if (segment.startsWith(':')) {
      const raw = segment.slice(1);
      if (raw.endsWith('*')) {
        source += `(?:/(?<${raw.slice(0, -1)}>.*))?`;
      } else if (raw.endsWith('+')) {
        source += `/(?<${raw.slice(0, -1)}>.+)`;
      } else if (raw.endsWith('?')) {
        source += `(?:/(?<${raw.slice(0, -1)}>[^/]+))?`;
      } else {
        source += `/(?<${raw}>[^/]+)`;
      }
    } else {
      source += `/${escapeRegExp(segment)}`;
    }
  }
  source += '$';
  return new RegExp(source);
}

function matchPattern(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  let regex = patternCache.get(pattern);
  if (!regex) {
    regex = patternToRegExp(pattern);
    patternCache.set(pattern, regex);
  }
  const match = regex.exec(pathname);
  if (!match) return null;

  const groups = (match.groups ?? {}) as Record<string, string | undefined>;
  if (
    groups.l1 !== undefined &&
    !(SUPPORTED_L1S as readonly string[]).includes(groups.l1)
  ) {
    return null;
  }
  if (
    groups.l2 !== undefined &&
    !(SUPPORTED_L2S as readonly string[]).includes(groups.l2)
  ) {
    return null;
  }

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (value !== undefined) params[key] = value;
  }
  return params;
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function classicRouteAction(
  pathname: string,
  pair: LanguagePair,
  search: URLSearchParams = new URLSearchParams(),
): RouteAction {
  for (const pattern of WEB_ROUTE_PATTERNS) {
    if (matchPattern(pattern, pathname)) return { kind: 'pass' };
  }

  for (const alias of LEGACY_ALIASES) {
    const params = matchPattern(alias.pattern, pathname);
    if (!params) continue;
    const target = alias.to(params, pair, search);
    if (target !== null) {
      return {
        kind: 'alias',
        path: target,
        dropSearchParams: alias.dropSearchParams ?? [],
      };
    }
  }

  for (const pattern of CLASSIC_ONLY_PATTERNS) {
    if (matchPattern(pattern, pathname)) return { kind: 'v2' };
  }

  return { kind: 'pass' };
}
