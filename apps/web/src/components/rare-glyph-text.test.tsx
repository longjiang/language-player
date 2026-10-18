// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@/providers/settings-provider', () => ({
  useSettingsContext: () => ({ tokenizedText: { typeFace: 'default' } }),
}));

import { RareGlyphProvider } from '@/providers/rare-glyph-provider';
import { RareGlyphText } from './rare-glyph-text';

class FakeFontFace {
  family: string;
  source: unknown;
  descriptors: unknown;
  constructor(family: string, source: unknown, descriptors: unknown) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
  }
  async load() {
    return this;
  }
}

const HASH = 'f3c1a9e2b7d4';

beforeEach(() => {
  vi.stubGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: vi.fn() },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/glyph-font/manifest')) {
        return new Response(
          JSON.stringify({
            version: 'subset-v1',
            style: 'sans',
            hash: HASH,
            covered: ['26030'],
            missing: [],
            fonts: {
              woff2: { url: `/glyph-font/${HASH}.woff2`, bytes: 4 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }),
  );
});

describe('RareGlyphText', () => {
  it('renders a chip before the subset loads, then the loaded glyph', async () => {
    const { container } = render(
      <RareGlyphProvider>
        <RareGlyphText text="遠將𦀰像" />
      </RareGlyphProvider>,
    );

    expect(container.querySelector('[data-rare-glyph="U+26030"]')).toBeTruthy();
    expect(container.querySelector('[data-rare-glyph="U+26030"]')?.getAttribute('aria-label')).toContain('U+26030');

    await waitFor(() => {
      const rare = container.querySelector(`[data-rare-glyph="U+26030"]`) as HTMLElement | null;
      expect(rare?.style.fontFamily).toBe(`LPRareHan-${HASH}`);
    });
    expect(container.textContent).toContain('遠將𦀰像');
  });
});
