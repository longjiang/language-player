import { describe, expect, it } from 'vitest';
import {
  createSettingsV2,
  normalizeSettingsV2,
  DISPLAY_DEFAULTS,
  TOKENIZED_TEXT_DEFAULTS,
} from './types';

/**
 * Settings LWW semantics (SPEC-039 §5.2): the apps hydrate from the cloud row
 * with `cloud.ts > local.ts` wins. A freshly created defaults blob must
 * therefore carry the EPOCH ts, never "now" — otherwise every boot with empty
 * local storage (logout wipe, cleared browser storage, new device, reinstall)
 * would make the fresh defaults look like the latest write, skip the cloud
 * restore, and show/resave the defaults.
 */
describe('settings last-write-wins', () => {
  it('createSettingsV2 stamps an epoch ts (fresh defaults must lose LWW)', () => {
    const s = createSettingsV2();
    expect(s.v).toBe(2);
    expect(s.ts).toBe(new Date(0).toISOString());
  });

  it('a real cloud row (any non-epoch ts) beats a fresh defaults blob', () => {
    const fresh = createSettingsV2(); // ts = epoch
    const cloud = {
      ...createSettingsV2(),
      ts: '2026-01-01T00:00:00.000Z',
      display: { ...DISPLAY_DEFAULTS, theme: 'light' as const },
    };
    // The hydrate rule used by both apps:
    const cloudWins = cloud.ts > fresh.ts;
    expect(cloudWins).toBe(true);
    const merged = normalizeSettingsV2({
      ...fresh,
      ...cloud,
      v: 2 as const,
      ts: new Date().toISOString(),
    });
    expect(merged.display.theme).toBe('light');
    expect(merged.tokenizedText.zoom).toBe(TOKENIZED_TEXT_DEFAULTS.zoom);
  });

  it('normalizeSettingsV2 fills missing sections from the defaults', () => {
    const restored = normalizeSettingsV2({
      v: 2,
      ts: '2026-01-01T00:00:00.000Z',
      display: { ...DISPLAY_DEFAULTS, theme: 'dark' as const },
    } as Partial<ReturnType<typeof createSettingsV2>>);
    expect(restored.ts).toBe('2026-01-01T00:00:00.000Z');
    expect(restored.display.theme).toBe('dark');
    // Sections absent from the stored blob come back with defaults.
    expect(restored.tokenizedText.enabled).toBe(TOKENIZED_TEXT_DEFAULTS.enabled);
    expect(restored.search.expandSubsSearch).toBe(false);
  });
});
