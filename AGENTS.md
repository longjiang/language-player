# AGENTS.md — Instructions for AI Coding Agents

## Project Identity

**Language Player** — A language learning platform using authentic video content with interactive dual subtitles. 60+ languages. Web + Mobile + Python backend.

## Essential Context

### What This Project Is
A monorepo consolidating three legacy codebases:
1. `zerotohero-nuxt/` (Vue 2/Nuxt 2) — **Classic** full-featured web app. REFERENCE ONLY. Do not edit.
2. `language-player-3/` (React Native/Expo 51) — **GO** mobile app. REFERENCE ONLY. Merged into `apps/mobile/` (Phase 8 Step 3).
   See `docs/lp-go-app-architecture.md` for a full analysis of its screens, components, and patterns.
3. `zerotohero-python-server/` or `zerotohero-python/` (Flask) — Backend. REFERENCE + eventual migration source.
   See `docs/lp-python-backend-architecture.md` for a full analysis of its routes, utilities, and patterns.

Note that the above three directories are **independent Git repositories**. They are listed in `.gitignore` so the monorepo does not track them yet. If need to commit changes to them, first `cd` into the directory and commit there. Never commit the monorepo unless the these are ignored in `.gitignore`, and never register them as submodules, or Netlify deploy will fail.

The **active development** happens in:
- `apps/web/` — Next.js 14 (replaces Classic)
- `apps/mobile/` — React Native/Expo 57 (replaces legacy `language-player-3/`)
- `packages/shared/` — Shared types & constants
- `packages/api-client/` — Shared API client
- `packages/utils/` — Shared utilities

### Critical Architecture Rules

1. **Shared packages must be platform-agnostic.** No React, React Native, Next.js, or Node-specific imports in `packages/*`. Use only pure TypeScript and cross-platform libraries (Axios, date-fns, etc.).

2. **UI components are NOT shared** between web and mobile. The rendering models are fundamentally different (React DOM vs React Native). Share logic, not views.

3. **The Nuxt Classic app is the source of truth for features.** When implementing a feature in the Next.js app, FIRST read the corresponding Nuxt page/component/store to understand how it works, THEN implement it in Next.js using the shared packages.

4. **Language state flows L1 → L2.** Every language-specific page lives under `/[l1]/[l2]/...`. The middleware reads these params, looks up language objects, and provides them via React Context.

5. **The backend is a Flask API** has a local dev URL and a production URL, which are noted in `apps/web/src/lib/api-url.ts`. All data goes through it. Directus 8 is the headless CMS — but treat it as a black box accessed via the Flask API. The reason is that we want to abstract the directus layer away from the web and mobile apps, so we can migrate to Directus 11 or another backend in the future without changing the clients.

6. **Use semantic design tokens, not hardcoded colors.** Never use hex values (`#fff`, `#94a3b8`, `#888`) or named colors (`"white"`, `"black"`) in components. Use NativeWind/Tailwind semantic classes like `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `bg-background`, `bg-card`, `border-border`. For React Native props that don't accept classes (e.g., `placeholderTextColor`, lucide icon `color`), import from `@/lib/theme-colors` which derives hex values from `packages/shared/tokens.ts`. Both apps share the same design tokens — colors, typography, spacing — from a single source of truth.

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

**⚠️ Always use `npx turbo` from the repo root** — it handles working directories automatically. If you must run a package script directly (e.g., `npx next build`, `npx tsc --noEmit`), `cd` into that package's directory first. Running `npx next build apps/web` from the root will fail with misleading CSS/webpack errors because Next.js interprets the path argument as the project root, not a subdirectory.

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

### Writing User-Facing Documentation

When writing or editing markdown documentation in `apps/web/content/docs/`, follow these guidelines:

**Tone & Voice**
- **Informal and friendly** — write like you're explaining to a friend, not writing a textbook
- **Second person ("you")** — address the reader directly; never use third person or passive voice
- **Short sentences** — break up long sentences; aim for one idea per sentence
- **Active voice** — "Click any word to see its definition" not "Words can be clicked to view definitions"

**Structure**
- Each doc starts with an `# H1` title (used as the page title and sidebar label)
- Use `## H2` for main sections and `### H3` for subsections (these appear in the "On this page" sidebar)
- Keep paragraphs short (2-4 sentences max)
- Use bullet lists for features and tips; tables for reference data
- Every doc ends with a **Tips** section

**Content Guidelines**
- **Lead with "what" and "why"** — explain what the feature does and why it's useful before diving into how
- **Show don't tell** — describe actual use cases, not abstract capabilities
- **Assume zero prior knowledge** — explain terminology; don't assume the reader knows what "L1/L2" or "tokenization" means
- **Be concise** — cut filler words; every sentence should add value
- **Cross-link** — reference other docs when mentioning related features (e.g., "See [Dictionary](/docs/vocab/dictionary) for details")

**What to Cut**
- **Filler clauses** — drop "— useful for X", "so you can Y", "making it easy to Z". If the feature's value isn't self-evident from what it does, you haven't described it well enough.
- **Implementation details** — don't mention APIs, storage mechanisms, sync intervals, batch sizes, or other internals. Describe what the user sees and does, not how the code works under the hood.
- **Meta advice** — don't justify features with generic learning theory ("builds listening comprehension", "for languages with fast speech"). If a tip doesn't reference a specific button, shortcut, or workflow in the app, it doesn't belong in the docs.
- **"Automatically" + "in the background"** — pick one. If something happens without user action, "automatically" is enough.

**Verify Before Writing**
- **Read the code** — before describing how a feature works, read the actual implementation. Don't guess. Incorrect descriptions (e.g., "overlays subtitles on top" when they're in a separate panel) are worse than no description.
- **Open the page** — verify the doc renders correctly and appears in the sidebar after creating it.

**Example (good):**
> Click any word in the subtitles to see its definition and save it to your vocabulary list.

**Example (avoid):**
> The interactive subtitle feature enables users to select lexical items, which triggers the display of dictionary entries including definitions and audio pronunciation, with the option to persist selections to a personalized vocabulary collection.

#### Using Translation Keys in Docs

Docs support `{$key}` syntax to reference CSV translation keys. When the page renders in a non-English locale, these keys are resolved to the locale's translation.

##### Where to Use Keys

- **UI labels** — button names, tab titles, menu items (e.g., `{$action.search}`, `{$title.dictionary}`, `{$label.show_translation}`)
- **Language names** — always use `{$lang.zh}`, `{$lang.ja}`, etc. (never hardcode "Chinese", "Japanese")
- **Proficiency levels** — `{$level.exam_cefr}`, `{$level.exam_hsk}`, `{$level.exam_jlpt}`

##### Where NOT to Use Keys

- **Doc H1 titles** — if no exact key exists, use plain English. A hybrid like "Popup {$title.dictionary}" produces "Popup 词典" in zh-Hans. Use a single pure key (e.g., `# {$title.explore}`) or plain text (e.g., `# Popup Dictionary`).
- **Common English words** — "video", "watch", "min", "new" are not UI labels. Programmatic replacement can match these by accident — always manually verify.
- **Descriptive phrases** — "See [Dictionary](/docs/vocab/dictionary) for details" does not need a key unless referring to the UI element.

##### Workflow

1. Read the doc and identify UI labels, language names, and level names that have CSV keys
2. Replace them with `{$key}` syntax (case-sensitive — match the CSV English value exactly)
3. Manually verify — check for false positives like `{$action.translation}s` (partial word matches)
4. Regenerate translations:

```bash
nvm use 22 && node scripts/translate-doc.mjs packages/docs/content/<path>.md
```

This resolves `{$key}` for all 31 locales, machine-translates the body via the Python `/translate` server (if running), and merges into `apps/web/src/data/docs-i18n/{locale}.json`. Requires Node ≥ 20 for translation; falls back to key-only resolution on older Node.

##### Dynamic Category Titles

Sidebar category names (Media, Reading, Vocab, etc.) are translated via `title.{folderName}` keys. Adding a new doc folder (e.g., `grammar/`) automatically looks up `title.grammar` — just create the CSV key and it works.

### When You Make Changes

- Update `specs/` if you implement a new feature or change behavior
- Update `ROADMAP.md` if you complete a planned task
- Add ADRs in `docs/adr/` for significant architectural decisions
- Never edit files in `zerotohero-nuxt/` or `language-player-3/` — they are reference-only
- Always do a type check with `npx turbo typecheck` and build check with `npm run build:check -w apps/web` before committing. Never push.

### Terminal & Server Start Conventions

**One server instance only.** Before starting `npx expo start` (or similar commands to start Next.js, Nuxt, or Python servers), check if an instance of the server is already running: `lsof -ti:8081` (and other similar ports, and potential alternate ports, e.g. 8082 for Metro). If the user says "it's running," trust them — don't open another.

**Always check you are in the right directory.** For the Classic Nuxt app, `cd` into zerotohero-nuxt/ before running `npm run dev`. For the mobile app, `cd` into apps/mobile/ before running `npx expo start`. For the Python backend, `cd` into zerotohero-python-server/ before running `python3.10 app.py`.

**Always use Node 22 for the mobile app.** Expo SDK 57 requires Node ≥20.19.4; Node 18 fails with `toReversed is not a function`. Before any Expo command:
```bash
cd apps/mobile && source ~/.nvm/nvm.sh && nvm use 22 && npx expo start --ios
```
The `nvm use 22` is **not optional** — the shell loses nvm context between terminal sessions, and `npx expo start` run from the repo root will pick up the wrong project config.

**Never use `--clear` unless proven necessary.** It wipes the bundle cache, forcing a full rebuild of 2000+ modules. Use `r` in the Metro terminal to reload instead.

**Escalation for Metro issues:**
1. Verify the file on disk is correct → press `r` in Metro (~1s), or similar commands for other servers
2. Restart Metro without `--clear`: `npx expo start --ios` (~10s), or similar restarts for other servers
3. `--clear` only as last resort (~minutes)
4. If unclear, check with the user

**For Metro, `npx expo run:ios`** does a full native build (needs CocoaPods). Prefer `npx expo start --ios` for development, which uses Expo Go. If you must use `run:ios`, the RVM Ruby has an x86_64 nkf gem on ARM Macs — work around it with:
```bash
EXPO_NO_POD_INSTALL=1 npx expo prebuild --platform ios && \
/usr/bin/ruby -S pod install --project-directory=ios && \
npx expo run:ios --no-install

### Mobile-V2 Porting Rules

**What "port" means**: Take the Next.js source file, translate EVERY line, EVERY component, EVERY toggle, EVERY control to React Native. Nothing skipped. Nothing simplified. Nothing "deferred." If Next.js has a feature, mobile-v2 must have it too.

**Porting Checklist (follow in order):**
1. Read the Next.js file completely first
2. Map NEXT component/API → MOBILE equivalent (see table below)
3. Use NativeWind className for styling (same tokens: `bg-background`, `text-foreground`, `border-border`, `bg-card`, etc.)
4. Use `useT()` / `t('key')` for ALL user-facing strings — never hardcode English
5. Use `ICON_MUTED`, `ICON_PRIMARY`, etc. from `@/lib/theme-colors` — never hardcode hex colors
6. Check SettingsContext API before calling — it has `updateDisplay()`, `updatePlayback()`, `updateTokenizedText()`, `updateReview()`, `getL2()`, `updateL2()`, `ensureL2()` — NEVER `set()`
7. Check DictionaryContext API — `doSearch()`, `saveRecent()`, `clearSearch()`, etc.
8. Check hooks (`useSavedWords`, `useLanguage`, `useSettingsContext`, `useDictionaryContext`, `useInflection`, `useStreamingExplanation`, `useDictionary`) for available methods

**Component Mapping Table:**

| Next.js | Mobile-v2 |
|---|---|
| `<div className="...">` | `<View className="...">` |
| `<span>`, `<p>`, `<h1>` | `<Text>` |
| `<button>` | `<Pressable>` |
| `<input type="checkbox">` + `<label>` | `<Switch>` |
| `<input type="range">` | Stepper buttons (+/−) with `<Pressable>` |
| `<select>` | Segmented `<Pressable>` row |
| `onClick` | `onPress` |
| `onChange` (text input) | `onChangeText` |
| `e.target.checked` | direct `value` from Switch `onValueChange` |
| `e.target.value` (range) | direct `number` from stepper |
| `cursor-pointer` | Remove (RN handles touches) |
| `hover:`, `focus:`, `active:` | Remove (web-only pseudo-classes) |
| `<TabbedPanel>` | `<TabbedPanel>` (already ported, same API) |
| `<TokenizedText>` | Skip if causes NativeWind interop crash; use plain `<Text>` |
| `useSettingsContext()` | `useSettingsContext()` (same API, different file) |
| `useLanguage()` → `{ l1, l2 }` | `useLanguage()` → `{ l1Lang, l2Lang }` (`.code` equivalent) |
| `useSession()` / `useAuth()` | `useAuth()` (same shape: `user`, `logout`) |
| `fetch(PYTHON_API_URL + ...)` | Same `fetch(PYTHON_API_URL + ...)` |
| `import { Button } from '@/components/ui/button'` | Skip (not ported) |
| `import Link from 'next/link'` | `useRouter()` from `expo-router` |
| `router.push(url)` | `router.push(path as any)` |
| `searchParams.get('key')` | `useLocalSearchParams<{ key: string }>()` |

**GOLDEN RULE**: Port, don't invent. Every time you think "I'll simplify this" or "I'll skip this for now" or "this is too complex for mobile" — STOP. You're wrong. Port it exactly. If something crashes (like NativeWind interop), use inline styles as fallback, but KEEP the feature.
