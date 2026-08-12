// ──────────────────────────────────────────────
// Web → mobile URL adapter (SPEC-069)
// ──────────────────────────────────────────────
//
// Translates website URLs (https://languageplayer.io/[l1]/[l2]/...) into the
// mobile app's internal Expo Router routes. The mobile app keeps language in
// Context/SecureStore instead of the URL (ADR-0010), so the web's language
// pair is converted into an `l2` param and route-group segments are dropped.

import { SUPPORTED_L2S } from '@langplayer/shared';

export interface MappedAppRoute {
  pathname: string;
  params: Record<string, string>;
}

/** Hosts that should open in the app (iOS Universal Links / Android App Links). */
const WEB_HOSTS = new Set(['languageplayer.io', 'language-player.netlify.app']);

/** Web auth routes live outside the /[l1]/[l2] prefix. */
const AUTH_ROUTES: Record<string, string> = {
  login: '/login',
  register: '/register',
  'forgot-password': '/forgot-password',
  'password-reset': '/password-reset',
  'verify-email': '/verify-email',
};

/** Static web paths (after stripping [l1]/[l2]) → mobile route. */
const STATIC_ROUTES: Record<string, string> = {
  explore: '/(tabs)/(media)',
  search: '/(tabs)/(media)/search',
  music: '/(tabs)/(media)/music',
  'live-tv': '/(tabs)/(media)/live-tv',
  'local-media': '/(tabs)/(media)/local-media',
  'watch-history': '/(tabs)/(media)/watch-history',
  'liked-videos': '/(tabs)/(me)/liked-videos',
  'saved-words': '/(tabs)/(vocab)/saved-words',
  review: '/(tabs)/(vocab)/review',
  reader: '/(tabs)/(reading)',
  epub: '/(tabs)/(reading)/epub',
  'web-reader': '/(tabs)/(reading)/web-reader',
  'go-pro': '/(tabs)/(me)/go-pro',
  profile: '/(tabs)/(me)',
  tokenizer: '/(tabs)/(me)/tokenizer-test',
  dictionary: '/(tabs)/(vocab)',
};

/** Mobile settings sub-screens that have a web equivalent. */
const SETTINGS_ROUTES: Record<string, string> = {
  display: '/(tabs)/(me)/settings/display',
  playback: '/(tabs)/(me)/settings/playback',
  review: '/(tabs)/(me)/settings/review',
  search: '/(tabs)/(me)/settings/search',
  speech: '/(tabs)/(me)/settings/speech',
};

function isSupportedL2(code: string): boolean {
  return (SUPPORTED_L2S as readonly string[]).includes(code);
}

/**
 * Map a website URL to the mobile route it should open.
 * Returns null for non-web, unknown, or desktop-only URLs.
 */
export function mapWebUrlToAppRoute(raw: string): MappedAppRoute | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!WEB_HOSTS.has(url.hostname)) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const queryParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    queryParams[key] = value;
  }

  // Root-level auth routes: /login, /register, /password-reset, ...
  if (segments.length < 2 || !isSupportedL2(segments[1]!)) {
    const authPath = AUTH_ROUTES[segments.join('/')];
    if (!authPath) return null;
    return { pathname: authPath, params: queryParams };
  }

  const l2 = segments[1]!;
  const rest = segments.slice(2);
  const params: Record<string, string> = { ...queryParams, l2 };

  // No deeper path → Explore.
  if (rest.length === 0) {
    return { pathname: '/(tabs)/(media)', params };
  }

  // Dynamic routes.
  if (rest[0] === 'watch' && rest[1]) {
    return {
      pathname: '/(tabs)/(media)/watch/[videoId]',
      params: { ...params, videoId: rest[1] },
    };
  }
  if (rest[0] === 'channel' && rest[1]) {
    return {
      pathname: '/(tabs)/(media)/channel/[channelId]',
      params: { ...params, channelId: rest[1] },
    };
  }
  if (rest[0] === 'dictionary' && rest[1] === 'entry' && rest[2] && rest[3]) {
    // Web entry IDs use commas for CEDICT-style ids; mobile routes use `~`.
    return {
      pathname: '/(tabs)/(vocab)/word/[entryId]',
      params: { ...params, entryId: rest[3].replace(/,/g, '~') },
    };
  }
  if (rest[0] === 'dictionary' && rest[1] === 'word' && rest[2]) {
    // Web searches by word text → seed the mobile dictionary search.
    return {
      pathname: '/(tabs)/(vocab)',
      params: { ...params, query: rest[2] },
    };
  }
  if (rest[0] === 'tv-shows' && rest[1]) {
    return {
      pathname: '/(tabs)/(media)/tv-shows/[id]',
      params: { ...params, id: rest[1] },
    };
  }
  if (rest[0] === 'playlists' && rest[1]) {
    return {
      pathname: '/(tabs)/(me)/playlists/[playlistId]',
      params: { ...params, playlistId: rest[1] },
    };
  }
  if (rest[0] === 'settings' && rest[1]) {
    const settingsPath = SETTINGS_ROUTES[rest[1]];
    if (!settingsPath) return null;
    return { pathname: settingsPath, params };
  }
  if (rest[0] === 'docs' && rest[1]) {
    return {
      pathname: '/(tabs)/(me)/docs',
      params: { ...params, path: rest.slice(1).join('/') },
    };
  }

  // Static paths.
  const staticPath = STATIC_ROUTES[rest.join('/')] ?? STATIC_ROUTES[rest[0]!];
  if (!staticPath) return null;
  return { pathname: staticPath, params };
}
