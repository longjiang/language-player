import { describe, expect, it } from 'vitest';
import {
  createSettingsV2,
  normalizeSettingsV2,
  normalizeL2Settings,
  DISPLAY_DEFAULTS,
  L2_DISPLAY_DEFAULTS,
  TOKENIZED_TEXT_DEFAULTS,
  type L2Settings,
  type SettingsV2,
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

/**
 * `display.translation` moved from GLOBAL (`display.translation`) to PER-L2
 * (`l2[code].display.translation`) on 2026-09-11. Old blobs and clouds still
 * carry the global field, so `normalizeSettingsV2` must fold it into every
 * configured language; losing it would silently flip a learner's translation
 * lines back on.
 */
describe('per-L2 translation migration', () => {
  it('folds a legacy global translation=true into every configured language', () => {
    const restored = normalizeSettingsV2({
      v: 2,
      ts: '2026-01-01T00:00:00.000Z',
      display: { theme: 'dark', translation: true, translationSplit: 0.6 },
      l2: {
        ja: { display: { traditional: false, byeonggi: true } },
        zh: { display: { traditional: true, byeonggi: true } },
      },
    } as unknown as Partial<SettingsV2>);

    expect(restored.l2.ja.display.translation).toBe(true);
    expect(restored.l2.zh.display.translation).toBe(true);
    // The unrelated per-L2 values survive the fold-in untouched.
    expect(restored.l2.zh.display.traditional).toBe(true);
  });

  it('folds a legacy global translation=false into every configured language', () => {
    const restored = normalizeSettingsV2({
      v: 2,
      ts: '2026-01-01T00:00:00.000Z',
      display: { theme: 'dark', translation: false, translationSplit: 0.6 },
      l2: { ja: { display: { traditional: false, byeonggi: true } } },
    } as unknown as Partial<SettingsV2>);

    expect(restored.l2.ja.display.translation).toBe(false);
  });

  it('a per-L2 value wins over the legacy global one', () => {
    const restored = normalizeSettingsV2({
      v: 2,
      ts: '2026-01-01T00:00:00.000Z',
      display: { theme: 'dark', translation: true, translationSplit: 0.6 },
      l2: { ja: { display: { translation: false, traditional: false, byeonggi: true } } },
    } as unknown as Partial<SettingsV2>);

    expect(restored.l2.ja.display.translation).toBe(false);
  });

  it('a blob with no legacy global field falls back to the default (true)', () => {
    const restored = normalizeSettingsV2({
      v: 2,
      ts: '2026-01-01T00:00:00.000Z',
      l2: { ja: { display: { traditional: false, byeonggi: true } } },
    } as unknown as Partial<SettingsV2>);

    expect(restored.l2.ja.display.translation).toBe(L2_DISPLAY_DEFAULTS.translation);
  });

  it('normalizeL2Settings fills every field of a sparse stored entry', () => {
    // Entries written by older schemas are missing fields added since. They
    // must come back complete, not `undefined`.
    const entry = normalizeL2Settings({ display: { traditional: true } } as Partial<L2Settings>);
    expect(entry.display).toEqual({
      translation: L2_DISPLAY_DEFAULTS.translation,
      traditional: true,
      byeonggi: L2_DISPLAY_DEFAULTS.byeonggi,
    });
    expect(entry.speech.rate).toBe(1.0);
    expect(entry.tokenSpan.phonetics.show).toBe('ruby');
    expect(entry.tokenSpan.definition.show).toBe(false);
    expect(entry.content.tvShowFilter).toBeNull();
  });

  it('createSettingsV2 seeds a new language with the per-L2 translation default', () => {
    const s = createSettingsV2('ja');
    expect(s.l2.ja.display.translation).toBe(L2_DISPLAY_DEFAULTS.translation);
    // The global field is gone from the schema entirely.
    expect((s.display as { translation?: unknown }).translation).toBeUndefined();
  });
});
