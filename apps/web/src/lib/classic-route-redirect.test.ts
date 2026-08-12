import { describe, expect, it } from 'vitest';
import {
  classicRouteAction,
  type LanguagePair,
  type RouteAction,
} from './classic-route-redirect';

const FALLBACK_PAIR: LanguagePair = { l1: 'en', l2: 'zh' };

function actionFor(
  path: string,
  pair: LanguagePair = FALLBACK_PAIR,
  search: URLSearchParams = new URLSearchParams(),
): RouteAction {
  return classicRouteAction(path, pair, search);
}

function expectPass(path: string, pair: LanguagePair = FALLBACK_PAIR) {
  expect(actionFor(path, pair)).toEqual({ kind: 'pass' });
}

function expectAlias(path: string, expected: string, pair: LanguagePair = FALLBACK_PAIR) {
  expect(actionFor(path, pair)).toMatchObject({ kind: 'alias', path: expected });
}

function expectV2(path: string, pair: LanguagePair = FALLBACK_PAIR) {
  expect(actionFor(path, pair)).toEqual({ kind: 'v2' });
}

describe('classicRouteAction', () => {
  describe('web routes pass through', () => {
    it.each([
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
      '/en/ja',
      '/en/ja/explore',
      '/en/ja/search',
      '/en/ja/music',
      '/en/ja/my-channels',
      '/en/ja/live-tv',
      '/en/ja/watch/abc123',
      '/en/ja/channel/UC123',
      '/en/ja/channels',
      '/en/ja/tv-shows',
      '/en/ja/tv-shows/42',
      '/en/ja/dictionary',
      '/en/ja/dictionary/word/hello',
      '/en/ja/dictionary/entry/edict/92130',
      '/en/ja/docs',
      '/en/ja/docs/media/explore',
      '/en/ja/docs/account/profile/sub',
      '/en/ja/epub',
      '/en/ja/go-pro',
      '/en/ja/liked-videos',
      '/en/ja/local-media',
      '/en/ja/playlists',
      '/en/ja/playlists/12',
      '/en/ja/profile',
      '/en/ja/review',
      '/en/ja/saved-words',
      '/en/ja/settings',
      '/en/ja/settings/display',
      '/en/ja/settings/playback',
      '/en/ja/settings/review',
      '/en/ja/settings/search',
      '/en/ja/settings/speech',
      '/en/ja/tokenizer',
      '/en/ja/watch-history',
      '/en/ja/web-reader',
    ])('%s', (path) => {
      expectPass(path);
    });
  });

  describe('renamed routes map to their web equivalent', () => {
    it.each([
      ['/en/ja/explore-media', '/en/ja/explore'],
      ['/en/ja/my-playlists', '/en/ja/playlists'],
      ['/en/ja/playlist/42', '/en/ja/playlists/42'],
      ['/en/ja/saved-words-games', '/en/ja/review'],
      ['/en/ja/youtube/likes', '/en/ja/liked-videos'],
      ['/en/ja/youtube/history', '/en/ja/watch-history'],
      ['/en/ja/youtube/search', '/en/ja/search'],
      ['/en/ja/youtube/search/猫', '/en/ja/search?q=%E7%8C%AB'],
      ['/en/ja/youtube/import', '/en/ja/search'],
      ['/en/ja/my-text', '/en/ja/reader'],
      ['/en/ja/recommended-video', '/en/ja/explore'],
      ['/en/ja/saved-phrases', '/en/ja/saved-words'],
      ['/en/ja/saved-phrases/123', '/en/ja/saved-words'],
      ['/en/ja/youtube/channel/UC123', '/en/ja/channel/UC123'],
      ['/en/ja/youtube/channel/UC123/Some%20Title', '/en/ja/channel/UC123'],
      ['/en/ja/video-view/youtube/abc123', '/en/ja/watch/abc123'],
      ['/en/ja/video-view/bring-your-own', '/en/ja/local-media'],
      ['/en/ja/show/movies/5', '/en/ja/tv-shows/5'],
      ['/en/ja/dictionary/edict/92130', '/en/ja/dictionary/entry/edict/92130'],
      ['/en/ja/dictionary/edict/random', '/en/ja/dictionary'],
      ['/en/ja/reader/shared', '/en/ja/reader'],
      ['/en/ja/reader/shared/42', '/en/ja/reader?noteId=42'],
      ['/en/ja/reader/md/hello', '/en/ja/reader?method=md&arg=hello'],
      [
        '/en/ja/reader/html-url/https%3A%2F%2Fexample.com',
        '/en/ja/reader?method=html-url&arg=https%3A%2F%2Fexample.com',
      ],
    ])('%s → %s', (path, expected) => {
      expectAlias(path, expected);
    });

    it('maps video-view query params to watch with queueType', () => {
      const action = actionFor(
        '/en/ja/video-view/youtube',
        FALLBACK_PAIR,
        new URLSearchParams('v=Qgzv_LBictg&id=70000029094&p=recommended'),
      );
      expect(action).toMatchObject({
        kind: 'alias',
        path: '/en/ja/watch/Qgzv_LBictg?queueType=recommended',
      });
      if (action.kind === 'alias') {
        expect(action.dropSearchParams).toEqual([
          'v',
          'id',
          'p',
          'sort',
          'lesson',
        ]);
      }
    });

    it('maps p=recommended_music to the same recommended queue type', () => {
      expect(
        actionFor(
          '/en/ja/video-view/youtube',
          FALLBACK_PAIR,
          new URLSearchParams('v=abc&p=recommended_music'),
        ),
      ).toMatchObject({
        kind: 'alias',
        path: '/en/ja/watch/abc?queueType=recommended',
      });
    });

    it('does not add queueType for numeric or unknown p values', () => {
      expect(
        actionFor(
          '/en/ja/video-view/youtube',
          FALLBACK_PAIR,
          new URLSearchParams('v=abc&p=42'),
        ),
      ).toMatchObject({ kind: 'alias', path: '/en/ja/watch/abc' });
    });

    it('maps root routes', () => {
      expectAlias('/dashboard', '/language-select');
      expectAlias('/go-pro', '/en/zh/go-pro');
      expectAlias('/privacy-policy', '/en/zh/docs/privacy-policy');
      expectAlias('/verify-email', '/register');
    });

    it('maps verify-email with an email query to the register verify step', () => {
      expect(
        actionFor(
          '/verify-email',
          FALLBACK_PAIR,
          new URLSearchParams('email=a%40b.com&code=123456'),
        ),
      ).toMatchObject({
        kind: 'alias',
        path: '/register?verifyEmail=a%40b.com',
      });
    });

    it('uses the last-used pair for pair-scoped root aliases', () => {
      const pair: LanguagePair = { l1: 'fr', l2: 'de' };
      expectAlias('/delete-account', '/fr/de/profile', pair);
      expectAlias('/go-pro', '/fr/de/go-pro', pair);
      expectAlias('/privacy-policy', '/fr/de/docs/privacy-policy', pair);
    });

    it('falls back to en/zh when no pair is stored', () => {
      expectAlias('/delete-account', '/en/zh/profile');
    });
  });

  describe('classic-only routes redirect to v2', () => {
    it.each([
      '/languages',
      '/language-map',
      '/language-icons',
      '/popular',
      '/stats',
      '/translators',
      '/phonological-features',
      '/all-routes',
      '/articles',
      '/compare-languages',
      '/compare-languages/ja',
      '/discover-shows',
      '/discover-shows/en/ja/movies',
      '/admin/quality-assurance',
      '/admin/db-audit',
      '/authentic-language-learning',
      '/travel-language-interactive',
      '/textbooks-workbooks',
      '/en/zh/textbooks-workbooks',
      '/en/ja/books',
      '/en/ja/bookshelf',
      '/en/ja/library',
      '/en/ja/book',
      '/en/ja/book/chapter',
      '/en/ja/book/list',
      '/en/ja/audiobooks',
      '/en/ja/audiobooks/fiction',
      '/en/ja/categories',
      '/en/ja/category/movies',
      '/en/ja/chinese/pinyin-chart',
      '/en/ja/chinese/explore-roots/123',
      '/en/ja/community',
      '/en/ja/compare/tones/word',
      '/en/ja/confirm-deletion',
      '/en/ja/contact-us',
      '/en/ja/discussions',
      '/en/ja/feed',
      '/en/ja/faq',
      '/en/ja/grammar',
      '/en/ja/grammar/view/42',
      '/en/ja/gutenberg/123',
      '/en/ja/gutenberg/123/4',
      '/en/ja/hindi/bookmarklet',
      '/en/ja/klingon/keyboard',
      '/en/ja/language-info',
      '/en/ja/learn',
      '/en/ja/learning-path',
      '/en/ja/levels',
      '/en/ja/minimal-pairs',
      '/en/ja/dictionary/hsk/123',
      '/en/ja/reader/share/foo',
      '/en/ja/page/42',
      '/en/ja/phrase/compare/foo/bar',
      '/en/ja/phrase/search/foo',
      '/en/ja/phrasebook/42',
      '/en/ja/phrasebook/42/57',
      '/en/ja/phrasebooks',
      '/en/ja/pinyin-list',
      '/en/ja/resource/list',
      '/en/ja/set-content-preferences',
      '/en/ja/set-language-level',
      '/en/ja/talks',
      '/en/ja/transcription',
      '/en/ja/tutoring',
      '/en/ja/tutoring/lesson/42',
      '/en/ja/updates',
      '/en/ja/youtube/browse/all/all/all/0',
      '/en/ja/youtube/channels',
      '/en/ja/youtube/playlist/PL123',
      '/en/ja/youtube/subscriptions',
      '/en/ja/youtube/view/abc123',
      '/en/ja/explore/new-levels-graphic',
      '/en/ja/lesson-videos',
      '/en/ja/separable',
      '/en/ja/online-courses',
      '/en/ja/video-view/music',
      '/en/ja/youtube/channel',
      '/en/ja/admin/assign-lesson-videos',
    ])('%s', (path) => {
      expectV2(path);
    });
  });

  describe('unknown paths keep the web 404 behavior', () => {
    it.each([
      '/en/ja/definitely-not-a-route',
      '/xx/yy/books',
      '/some/random/path',
      '/api/python/videos',
    ])('%s', (path) => {
      expectPass(path);
    });
  });
});
