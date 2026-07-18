# AGENTS.md — Instructions for AI Coding Agents

## Project Identity

**Language Player** — A language learning platform using authentic video content with interactive dual subtitles. 60+ languages. Web + Mobile + Python backend.

## Essential Context

### What This Project Is
A monorepo consolidating three legacy codebases:
1. `zerotohero-nuxt/` (Vue 2/Nuxt 2) — **Classic** full-featured web app. REFERENCE ONLY. Do not edit.
2. `language-player-3/` (React Native/Expo 51) — **GO** mobile app. REFERENCE + eventual migration source.
   See `docs/lp-go-app-architecture.md` for a full analysis of its screens, components, and patterns.
3. `zerotohero-python-server/` or `zerotohero-python/` (Flask) — Backend. REFERENCE + eventual migration source.
   See `docs/lp-python-backend-architecture.md` for a full analysis of its routes, utilities, and patterns.

Note that the above three directories are **independent Git repositories**. They are listed in `.gitignore` so the monorepo does not track them yet. If need to commit changes to them, first `cd` into the directory and commit there. Never commit the monorepo unless the these are ignored in `.gitignore`, and never register them as submodules, or Netlify deploy will fail.

The **active development** happens in:
- `apps/web/` — Next.js 14 (replaces Classic)
- `packages/shared/` — Shared types & constants
- `packages/api-client/` — Shared API client
- `packages/utils/` — Shared utilities

### Critical Architecture Rules

1. **Shared packages must be platform-agnostic.** No React, React Native, Next.js, or Node-specific imports in `packages/*`. Use only pure TypeScript and cross-platform libraries (Axios, date-fns, etc.).

2. **UI components are NOT shared** between web and mobile. The rendering models are fundamentally different (React DOM vs React Native). Share logic, not views.

3. **The Nuxt Classic app is the source of truth for features.** When implementing a feature in the Next.js app, FIRST read the corresponding Nuxt page/component/store to understand how it works, THEN implement it in Next.js using the shared packages.

4. **Language state flows L1 → L2.** Every language-specific page lives under `/[l1]/[l2]/...`. The middleware reads these params, looks up language objects, and provides them via React Context.

5. **The backend is a Flask API** has a local dev URL and a production URL, which are noted in `apps/web/src/lib/api-url.ts`. All data goes through it. Directus 8 is the headless CMS — but treat it as a black box accessed via the Flask API. The reason is that we want to abstract the directus layer away from the web and mobile apps, so we can migrate to Directus 11 or another backend in the future without changing the clients.

### Before Implementing Any Feature

1. Read the relevant Nuxt Classic implementation in `zerotohero-nuxt/`
   See `docs/lp-classic-app-architecture.md` for a full analysis of its pages, components, and patterns.
2. Read `docs/lp-go-app-architecture.md` for the GO app's equivalent screens and components
3. Check if `@langplayer/shared` already has the types you need
4. Check if `@langplayer/api-client` already has the endpoint you need
5. Read `specs/` for existing feature specifications
6. Read `docs/adr/` for relevant architecture decisions

### File Naming & Organization

```
apps/web/src/
├── app/                    ← Next.js App Router pages
│   ├── [l1]/[l2]/         ← Language-pair scoped routes
│   └── (auth)/             ← Auth routes (no language context)
├── components/
│   ├── ui/                 ← shadcn/ui primitives (Button, Input, etc.)
│   ├── video/              ← Video player components
│   ├── dictionary/         ← Dictionary components
│   └── layout/             ← Header, sidebar, navigation
├── hooks/                  ← React hooks (useVideo, useDictionary, etc.)
├── lib/                    ← Next.js-specific utilities
└── providers/              ← React Context providers
```

### Key Terms

- **L1** = Native language (UI language, e.g., `en`)
- **L2** = Target language being learned (e.g., `zh`, `ja`)
- **Directus** = Headless CMS at the database layer
- **Lemma** = Base/dictionary form of a word
- **Token** = A word or punctuation unit after tokenization
- **CEFR** = Common European Framework of Reference (A1–C2)
- **HSK** = Chinese proficiency test levels (1–6)
- **JLPT** = Japanese proficiency test levels (N5–N1)

### Commands

```bash
nvm use 22                    # Required Node version
npm install                   # Install all workspace deps
npx turbo dev                 # Start all dev servers
npx turbo build               # Build all apps
npx turbo build --filter=@langplayer/web  # Build only web
npx turbo lint                # Lint all
npx turbo typecheck           # Type-check all
```

### Test Credentials

Use these to log in during local development:

| | |
|---|---|
| **Mary** | `tester.mary@zerotohero.ca` / `pc8qm8LBZeGuBno` |
| **Bob** | `tester.bob@zerotohero.ca` / `LTgoXTe8qqGJhRd` |

### Pricing Tiers

**Free Account:**
- Access 600,000+ videos across 207+ languages
- See collocations, example sentences, verb inflections, and Chinese character decomposition in the dictionary
- See only first 10 lines of interactive transcripts with English translation
- See only 2 examples of words in videos
- 14-day money-back guarantee

**Pro Account:**
- Access 600,000+ videos across 207+ languages
- See collocations, example sentences, verb inflections, and Chinese character decomposition in the dictionary
- See complete interactive transcripts with English translation
- See hundreds of examples of words in videos, or in particular TV shows

**Pricing Plans:**

| Plan | Price |
|---|---|
| Monthly | US$10/mo |
| Annual | US$90/yr (billed annually) |
| Lifetime | US$169 (one-time payment, lifetime access) |

Contact: [jon.long@zerotohero.ca](mailto:jon.long@zerotohero.ca)

### Internationalization (i18n)

**Never hardcode English strings in the UI.** Always use the `t()` function from `useT()`:

```tsx
import { useT } from '@/hooks/use-t';
const t = useT();
// ...
<p>{t('msg.loading')}</p>
```

**Translation workflow** — `translations.csv` is the **source of truth**. Never edit locale JSONs directly.

To add a new translatable key:

1. Create a JSON payload file with the key + English text + all 31 locale translations. All locales **must** be present (all-or-nothing — the script rejects partial data). **Use your own multilingual knowledge to supply the translations — do NOT call external translation APIs for this step.**

```json
{
  "key": "msg.my_new_key",
  "en": "English text here",
  "zh-Hans": "...",
  "zh-Hant": "...",
  "af": "...",
  "ar": "...",
  "ca": "...",
  "de": "...",
  "el": "...",
  "es": "...",
  "fi": "...",
  "fr": "...",
  "ga": "...",
  "hi": "...",
  "hr": "...",
  "hu": "...",
  "id": "...",
  "it": "...",
  "ja": "...",
  "ko": "...",
  "nl": "...",
  "no": "...",
  "pl": "...",
  "pt": "...",
  "ro": "...",
  "ru": "...",
  "sr": "...",
  "sv": "...",
  "sw": "...",
  "th": "...",
  "tr": "...",
  "vi": "..."
}
```

Do not create more than one payload one at a time.

2. Add the key to the CSV (the locale order above matches the CSV columns):

```bash
node scripts/add-translation-key.mjs path/to/payload.json
# or via stdin:
echo '{"key":"msg.foo","en":"...",...}' | node scripts/add-translation-key.mjs --stdin
```

Repeat steps 1 and 2 for each new key you want to add.

3. **Regenerate locale JSONs from the CSV:**

```bash
node scripts/sync-translations.mjs csv-to-json
```

4. For bulk translation of empty cells, use `batch-translate.mjs` (skips ICU plural strings to avoid syntax corruption):

```bash
node scripts/batch-translate.mjs --locale=fr
```

**ICU MessageFormat** — Strings with `{n, plural, one {...} other {...}}` must preserve ICU keywords (`one`, `other`, `plural`, `#`) exactly. Do NOT translate these keywords. Use `scripts/translate-icu.mjs` as a reference for manual ICU translations.

**Full locale list** (31 locales, CSV column order):
`en`, `zh-Hans`, `zh-Hant`, `af`, `ar`, `ca`, `de`, `el`, `es`, `fi`, `fr`, `ga`, `hi`, `hr`, `hu`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt`, `ro`, `ru`, `sr`, `sv`, `sw`, `th`, `tr`, `vi`

Before translating, always check if `translations.csv` already has the same or very similar key that can do the same job. If so, modify your key new key to reuse it instead of creating a new key.

### When You Make Changes

- Update `specs/` if you implement a new feature or change behavior
- Update `ROADMAP.md` if you complete a planned task
- Add ADRs in `docs/adr/` for significant architectural decisions
- Never edit files in `zerotohero-nuxt/` or `language-player-3/` — they are reference-only
- Always do a type check and build check before committing. Never push.