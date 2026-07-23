# ADR-0012: Documentation i18n Pipeline

**Date**: 2026-07-23
**Status**: accepted

## Context

The docs system (`apps/web/content/docs/`) contains 23 markdown files across 5 categories (general, account, media, reading, vocab). These need to be served in all 31 supported UI locales. The docs contain two types of translatable content:

1. **UI labels** referenced in docs — button names, tab titles, language names, proficiency levels — which have existing CSV translation keys
2. **Body text** — freeform English prose that needs machine translation

The challenge is combining these two layers efficiently: resolving `{$key}` references from the CSV while also translating the body text per locale.

## Options Considered

### Option A: Store full translations per locale in markdown files
- **Pros**: Simple, no build step
- **Cons**: 31 copies of each doc to maintain, impossible to keep in sync, edits require touching all 31 files

### Option B: Run-time key resolution + on-demand machine translation
- **Pros**: No build step, always fresh
- **Cons**: Every page load hits the translate server, slow, expensive, unreliable

### Option C: Build-time pipeline (chosen)
- **Pros**: Fast page loads (pre-built JSON), key resolution from CSV (authoritative), machine translation only on doc edit
- **Cons**: Requires a build step after editing docs, translate server must be running during build

## Decision

**Option C: Build-time pipeline with three-layer architecture.**

### Layer 1: Key resolution (always on)
The CSV (`translations.csv`) is the source of truth for UI labels. Doc markdown files use `{$key}` syntax (e.g., `{$title.dictionary}`, `{$lang.ja}`) to reference CSV entries. These keys are resolved at build time by substituting the locale's CSV value.

Keys are resolved for **all 31 locales** including English — the `en` value is substituted directly, avoiding raw `{$key}` appearing in the UI.

### Layer 2: Machine translation (when server available)
The Python `/translate` endpoint at `localhost:5001` translates the body text from English to each target locale. Plain-text H1 titles (without `{$key}`) are also translated. The translator's placeholder protection keeps `{$key}` patterns intact during translation, so key resolution happens cleanly after translation.

### Layer 3: Locale JSON output
Both layers produce `apps/web/src/data/docs-i18n/{locale}.json` — an array of `{slug, title, content}` objects, one per doc. These files are committed and served statically at runtime.

### Data flow
```
.md source → {$key} resolution (CSV) → body translation (Python /translate) → {locale}.json → page render
```

## Scripts

| Script | Scope | Translates? | When to use |
|---|---|---|---|
| `scripts/translate-doc.mjs` | One doc → all 31 locales | ✅ (if Python up) | **Daily driver.** After editing a single `.md` — resolves keys, translates body + plain H1, merges into locale JSONs. Shows per-locale progress (🗝/🌐). |
| `scripts/translate-docs.mjs` | All docs × all locales, or `--locale=xx` | ✅ (if Python up) | **Full rebuild.** Use after sweeping changes across multiple docs, or to regenerate all locales from scratch. Slow. |
| `scripts/resolve-doc-keys.mjs` | One doc or all docs | ❌ | **Offline fix.** CSV key resolution only — no Python needed. Use when you only changed `{$key}` references and don't need body re-translation. Instant. |

Each script merges into `apps/web/src/data/docs-i18n/{locale}.json` — existing entries for other docs are preserved.

## Search

The search index is built at request time from the locale JSON files via `getSearchIndex(l1)`. For any locale (including `en`), it loads `docs-i18n/{l1}.json` and passes the array to Fuse.js on the client.

**Fuse.js configuration:**
```js
new Fuse(searchIndex, {
  keys: ['title', 'content'],
  threshold: 0.4,
  ignoreLocation: true,  // critical for Chinese/Asian languages — long docs penalize mid-document matches
  includeScore: true,
})
```

Without `ignoreLocation: true`, Fuse.js heavily penalizes matches deep in long documents, making 2-character Chinese queries (like 流程, 发现) return zero results even when the text literally contains them.

## Category titles

Category folder names (media, reading, vocab, account, general) are translated via `title.{folderName}` CSV keys. The key is derived dynamically from the folder slug — adding a new folder (e.g., `grammar/`) automatically looks up `title.grammar`. Both the sidebar (`DocSidebar`) and TOC page (`DocList`) use this pattern via the `CategoryTitle` client component.

## Doc H1 titles

Doc H1s should use a pure `{$key}` (e.g., `# {$title.explore}`) when a matching CSV key exists, or plain English (e.g., `# Popup Dictionary`) when no key exists. Hybrid H1s like `# Popup {$title.dictionary}` produce broken mixed-language titles like "Popup 词典" and should be avoided. Plain-text H1s are machine-translated by the Python server during the build.

## Consequences

- Docs must be rebuilt after editing: `nvm use 22 && node scripts/translate-doc.mjs <path>`
- Python `/translate` server must be running for full translation (falls back to key-only if unavailable)
- Node ≥ 20 required for `fetch` API (Node 18's experimental fetch cannot resolve localhost)
- `en.json` is now treated identically to other locale JSONs — it resolves `{$key}` to English values
- All 31 locale JSONs are committed to the repo
- Cross-references between docs use absolute paths (`/docs/vocab/dictionary`) and must be updated when files are renamed
