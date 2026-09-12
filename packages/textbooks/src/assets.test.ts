import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXTBOOK_ASSET_BASE_URL,
  createAssetResolver,
  resolveAssetKey,
} from './assets';

describe('DEFAULT_TEXTBOOK_ASSET_BASE_URL', () => {
  // Both apps read this one constant. They previously disagreed — web defaulted
  // to a local path nothing served, mobile to a folder that does not exist — so
  // the shape is pinned here rather than left to each call site.
  it('points at the textbook folder under the shared host root', () => {
    expect(DEFAULT_TEXTBOOK_ASSET_BASE_URL).toBe(
      'https://server.chinesezerotohero.com/data/interactive-textbook',
    );
  });

  it('has no trailing slash, so keys join cleanly', () => {
    expect(DEFAULT_TEXTBOOK_ASSET_BASE_URL.endsWith('/')).toBe(false);
  });

  it('resolves a real content key to an absolute, fetchable URL', () => {
    expect(resolveAssetKey(DEFAULT_TEXTBOOK_ASSET_BASE_URL, 'tblt-hsk4/u06/a1-map.png')).toBe(
      'https://server.chinesezerotohero.com/data/interactive-textbook/tblt-hsk4/u06/a1-map.png',
    );
  });

  it('percent-encodes a workbook audio filename but keeps the separators', () => {
    const url = resolveAssetKey(DEFAULT_TEXTBOOK_ASSET_BASE_URL, 'tblt-hsk4/u06/六A ➊ 上海.mp3');
    expect(url.startsWith(`${DEFAULT_TEXTBOOK_ASSET_BASE_URL}/tblt-hsk4/u06/`)).toBe(true);
    // Still one path segment per key segment: the slashes survive.
    expect(url.split('/').length).toBe(DEFAULT_TEXTBOOK_ASSET_BASE_URL.split('/').length + 3);
    expect(url).not.toContain(' ');
  });

  it('is what the resolver wires up, so a caller cannot pass a different host by accident', () => {
    const resolve = createAssetResolver(DEFAULT_TEXTBOOK_ASSET_BASE_URL);
    expect(resolve('tblt-hsk4/u06/a2-a.jpg')).toBe(
      `${DEFAULT_TEXTBOOK_ASSET_BASE_URL}/tblt-hsk4/u06/a2-a.jpg`,
    );
  });
});
