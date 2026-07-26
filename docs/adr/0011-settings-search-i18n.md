# ADR 0011: Settings Search — Locale-Agnostic Search Index

> **Status:** Accepted
> **Date:** 2026-07-25
> **Replaces:** N/A (new feature)
> **See also:**
> - [SPEC-015: Mobile Settings Completion](../specs/015-mobile-settings-completion.md)
> - [ADR-0009: Internationalization](../adr/0009-internationalization.md) (if exists)

---

## Context

The mobile settings screen is being migrated from a tabbed layout to a searchable list→detail pattern (iOS Settings style). The search bar must filter settings categories by matching against control labels (toggle labels, segmented option labels, slider labels) — not just the category title.

The app supports **31 locales**. A search implementation that hardcodes English strings (e.g., `'theme', 'font', 'karaoke'`) fails for non-English users. A German user searching "Schrift" should find the Display row because "Schrift" is the German translation of "font", which is a control label within Display settings.

We need a search index that works for all 31 locales without manual per-locale maintenance.

## Options Considered

### Option A: Hardcoded English Labels ❌

Store English strings directly. Search matches only English.

```ts
const LABELS = { display: ['theme', 'font', 'karaoke', ...] };
// German user searching "Schrift" → no match
```

**Rejected**: Fails for 30 of 31 locales.

### Option B: Titles + Subtitles Only ❌

Only search the already-localized row titles and subtitles. No deep search into control labels.

**Rejected**: Searching "karaoke" or "font" would find nothing. Users must know which category contains a setting. For 5 categories this borderline works, but as settings grow it degrades.

### Option C: Build-Time Inverted Index ❌

A script reads `translations.csv` at build time and generates a JSON map per locale: `{ "Schrift": ["display"], "Karaoke": ["playback"], ... }`.

**Rejected**: Adds a build step, ~1MB of JSON across 31 locales, and doesn't handle dynamic ICU strings with `{n}` placeholders.

### Option D: Translation-Key Arrays + Cached Resolution ✅ SELECTED

Store i18n **translation keys** (not strings). Pre-resolve keys once when the locale changes. Search against the cached localized strings.

## Decision

**Use Option D: translation-key arrays with cached locale resolution.**

### Mechanism

1. **Store keys, not strings** — Each settings category has an array of translation keys for its searchable control labels:

```ts
const SEARCHABLE_LABEL_KEYS: Record<string, string[]> = {
  display: [
    'setting.theme', 'setting.light', 'setting.dark', 'setting.system',
    'label.font', 'setting.font_default', 'setting.font_serif', 'setting.font_sans_serif',
    'label.text_size', 'setting.smaller', 'setting.bigger',
    'label.show_phonetics', 'setting.phonetics_on_top', 'setting.phonetics_replace',
    'setting.off', 'setting.all_words', 'setting.hard_words_only',
    'label.show_gloss_saved', 'label.show_interlinear_gloss',
    'label.character_set', 'setting.simplified', 'setting.traditional',
    'label.show_hanja', 'label.show_hantu',
    'setting.quiz_mode',
    'label.show_translation', 'label.enable_popup_dictionary',
    'label.tokenized_text_preview',
  ],
  playback: [
    'label.captions_display_as', 'title.transcript', 'label.subtitles',
    'label.smooth_scroll', 'label.karaoke', 'label.auto_pause',
  ],
  speech: [
    'label.voice', 'label.speed', 'label.rate', 'label.pitch',
  ],
  review: [
    'label.new_cards_per_day',
  ],
  offline: [
    'title.offline_dictionaries', 'action.download', 'action.delete',
  ],
};
```

2. **Pre-resolve once on locale change** — When `l1Lang.code` changes, resolve all keys through `t()` and cache the lowercased results:

```ts
const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

useEffect(() => {
  const result: Record<string, string[]> = {};
  for (const [category, keys] of Object.entries(SEARCHABLE_LABEL_KEYS)) {
    result[category] = keys.map(key => t(key).toLowerCase());
  }
  setLocalizedLabels(result);
}, [l1Lang.code]); // re-resolves only on L1 switch, not per keystroke
```

3. **Search against cached strings** — The search `useMemo` uses `localizedLabels` for O(1) lookup per category. Title and subtitle are already localized via `t()` at render time:

```ts
const filteredSections = useMemo(() => {
  if (!query.trim()) return SECTIONS;
  const q = query.toLowerCase();
  return SECTIONS.map(s => ({
    ...s,
    rows: s.rows.filter(row => {
      if (row.title.toLowerCase().includes(q)) return true;
      if (row.subtitle?.toLowerCase().includes(q)) return true;
      const labels = localizedLabels[row.key];
      if (labels?.some(label => label.includes(q))) return true;
      return false;
    }),
  })).filter(s => s.rows.length > 0);
}, [query, localizedLabels]);
```

### Performance

- **Locale switch**: ~30 keys × `t()` calls = sub-millisecond (memoized `Intl.MessageFormat` instances)
- **Per-keystroke**: array `.includes()` on pre-resolved string arrays, no `t()` calls
- **Memory**: ~30 strings per locale, negligible

## Example: German User

| User types | Matches |
|---|---|
| "Anzeige" | Row title (`t('setting.display')` → "Anzeige") |
| "dunkel" | Control label (`t('setting.dark')` → "Dunkel") |
| "Schrift" | Control label (`t('label.font')` → "Schrift") |
| "Karaoke" | Control label (`t('label.karaoke')` → "Karaoke") |
| "Karten" | Control label (`t('label.new_cards_per_day')` → "Neue Karten pro Tag") |

All work without any locale-specific code. Adding control labels is just adding their translation key to the array.

## Consequences

### Positive
- All 31 locales work automatically — no per-locale maintenance
- Translation keys serve as self-documenting index of what's searchable
- Keys already exist in `translations.csv` (they're the same keys the UI uses)
- No build step, no extra data files
- Adding a new control = adding its key to the array (one line)

### Negative
- Every searchable control label must have a CSV translation key
- If a control's label changes (e.g., "Karaoke mode" → "Highlight mode"), the key may also change, requiring an update to the array
- New controls without CSV keys need keys created first

### Mitigation
- The key array lives in `apps/mobile/app/(tabs)/(me)/settings/index.tsx`, colocated with the row definitions. A comment at the top of the array reminds developers to update it when adding controls.
- TypeScript can't enforce key validity at compile time (string keys), but a runtime warning in dev mode could flag missing/failed `t()` lookups.
