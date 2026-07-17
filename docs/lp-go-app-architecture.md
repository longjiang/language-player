# Language Player GO — App Architecture Reference

> Analysis of `language-player-3/` (React Native / Expo 51).
> This is a reference document for implementing equivalent features in `apps/web/` (Next.js 14).

## Tech Stack

- **Framework**: Expo SDK 51 with Expo Router (file-based routing)
- **UI**: React Native + custom themed components + `react-native-gesture-handler`
- **State**: React Context (9 contexts) + local state
- **Dictionary DB**: Local SQLite via `expo-sqlite` (downloaded from CDN at runtime)
- **Backend**: Directus 8 (headless CMS) + Python Flask API
- **Auth**: Directus JWT (stored in `expo-secure-store`)

---

## Route Map (Expo Router)

```
_layout.tsx                          ← Root layout (providers)
├── index.tsx                        ← Splash / redirect to tabs or onboarding
├── login.tsx
├── register.tsx
├── verify-email.tsx
├── delete-account.tsx
├── go-pro.tsx                       ← Premium subscription
├── privacy-policy.tsx
├── settings.tsx
├── account.tsx
├── select-l1.tsx                    ← Onboarding: pick native language
├── select-l2.tsx                    ← Onboarding: pick target language
├── select-level.tsx                 ← Onboarding: pick proficiency level
├── acquisition-survey.tsx           ← Onboarding: how'd you learn?
│
└── (tabs)/
    ├── _layout.tsx                  ← Tab bar (3 tabs)
    │
    ├── (media)/                     ← TAB 1: Media / Explore
    │   ├── _layout.tsx
    │   ├── index.tsx                ← Home: VideoHero + YouTubeVideoList (recommended)
    │   ├── search.tsx               ← Video search (by title or YouTube URL)
    │   └── tv-shows.tsx             ← TV Shows browser (filtered/sorted list)
    │
    ├── (dictionary)/                ← TAB 2: Dictionary
    │   ├── _layout.tsx
    │   └── dictionary/
    │       ├── index.tsx            ← Search page (DictionaryComponent)
    │       └── word/
    │           └── [id].tsx         ← Word detail page (DictionaryEntryContent)
    │
    └── (me)/                        ← TAB 3: Me / Profile
        ├── _layout.tsx
        ├── index.tsx                ← Language progress (level + watch time)
        ├── saved-words.tsx          ← Vocabulary list (WordList)
        └── watch-history.tsx        ← Recently watched videos
```

---

## Screens Detail

### TAB 1: Media / Explore

| Screen | Path | Purpose |
|---|---|---|
| **Home** | `(media)/index.tsx` | VideoHero (featured) + infinite YouTubeVideoList. Pulls recommendations from Python API. Has language switcher (L1/L2 flags). |
| **Search** | `(media)/search.tsx` | Search YouTube videos by title OR paste a YouTube URL directly. Uses Directus API. |
| **TV Shows** | `(media)/tv-shows.tsx` | Browse TV shows catalog. Filter by locale, sort by views/title/year. Uses TVShowsContext. |

### TAB 2: Dictionary

| Screen | Path | Purpose |
|---|---|---|
| **Dictionary Search** | `(dictionary)/dictionary/index.tsx` | Search bar (DictionaryComponent) + results list. Each result card shows: head word, alt script, pronunciation, definitions (truncated). Clicking a result navigates to word detail. |
| **Word Detail** | `(dictionary)/dictionary/word/[id].tsx` | Full dictionary entry. Shows: head word (large), alt script, pronunciation, proficiency level, full definitions, BookmarkButton, example sentences from videos (SubsSearch component). Has its own search bar for looking up other words. |

### TAB 3: Me / Profile

| Screen | Path | Purpose |
|---|---|---|
| **Progress** | `(me)/index.tsx` | Current L2 proficiency level (LevelButton), total watch time, logout button. |
| **Saved Words** | `(me)/saved-words.tsx` | Vocabulary list. FlatList of words with BookmarkButton (to remove) + touch to navigate to word detail. Has "Clear All" action. |
| **Watch History** | `(me)/watch-history.tsx` | Recently watched videos list. |

### Auth / Onboarding

| Screen | Purpose |
|---|---|
| `login.tsx` / `register.tsx` | Email + password auth via Directus |
| `select-l1.tsx` | Choose UI/native language |
| `select-l2.tsx` | Choose target language to learn |
| `select-level.tsx` | Choose CEFR/HSK/JLPT proficiency level |
| `acquisition-survey.tsx` | How user acquired the language (heritage, classroom, etc.) |

---

## Key Components

### Dictionary Components

| Component | File | Purpose |
|---|---|---|
| **DictionaryComponent** | `components/DictionaryComponent.tsx` | Search bar + result list. Used on both Search page and Word Detail page (with `showBackIcon`). Debounced search. Shows head word, alt, pronunciation, truncated definitions. |
| **DictionaryEntryContent** | `components/DictionaryEntryContent.tsx` | Full word detail view. Large head character, alt script, pronunciation, level badge, BookmarkButton, full DefinitionList, example sentences from SubsSearch. |
| **PopupDictionaryModal** | `components/PopupDictionaryModal.tsx` | Bottom sheet (RBSheet) for video word lookup. Contains PopupDictionaryHeader + PopupDictionaryContent. |
| **PopupDictionaryContent** | `components/PopupDictionaryContent.tsx` | Dictionary results inside the popup. Entry cards with "See details →" navigation to word detail page. |
| **PopupDictionaryHeader** | `components/PopupDictionaryHeader.tsx` | Header of the popup: shows token text, context, translation. |
| **DefinitionList** | `components/DefinitionList.tsx` | Renders a list of definitions with optional numbering. |
| **DictionaryLoadingModal** | `components/DictionaryLoadingModal.tsx` | Full-screen loading overlay while dictionary DB downloads. |

### Word / Bookmark

| Component | File | Purpose |
|---|---|---|
| **BookmarkButton** | `components/BookmarkButton.tsx` | Toggle save/unsave word. Uses `Ionicons` bookmark/bookmark-outline icons. Integrates with UserDataContext. Takes `wordId`, `head`, `alternate`, `forms`, `context`, `size`. |
| **WordList** | `components/WordList.tsx` | FlatList of saved words. Each row: BookmarkButton + head word + pronunciation + definitions. Touch navigates to word detail. |

### Video / Media

| Component | File | Purpose |
|---|---|---|
| **VideoHero** | `components/VideoHero.tsx` | Featured video banner at top of Media home. |
| **VideoWithTranscript** | `components/VideoWithTranscript.tsx` | Main video player + interactive transcript. Uses VideoPlayerContext. |
| **VideoControlBar** | `components/VideoControlBar.tsx` | Play/pause, skip, speed, subtitle toggle. |
| **YouTubeVideo** | `components/YouTubeVideo.tsx` | Single YouTube video player with transcript. |
| **YouTubeVideoList** | `components/YouTubeVideoList.tsx` | Infinite scroll list of YouTubeVideoCard items. |
| **YouTubeVideoCard** | `components/YouTubeVideoCard.tsx` | Card with thumbnail, title, channel, difficulty level. |
| **ShowCard** | `components/ShowCard.tsx` | TV show card with cover image, title, episode count. |
| **SyncedTranscript** | `components/SyncedTranscript.tsx` | Scrollable transcript synced to video playback. |
| **SubsSearch** | `components/SubsSearch.tsx` | Search subtitle lines for a word. Shows examples with timestamps. Used on Word Detail page. |
| **TokenizedText** | `components/TokenizedText.tsx` | Subtitle line with tappable tokens. Each token opens PopupDictionaryModal. |
| **Token** | `components/Token.tsx` | Individual clickable token/word. |
| **MiniPlayer** | `components/MiniPlayer.tsx` | Minimized video player (persistent across tabs). |

### UI Primitives

| Component | Purpose |
|---|---|
| `ThemedScreen` | Screen wrapper with theme-aware background |
| `ThemedView` | Theme-aware View |
| `ThemedText` | Theme-aware Text with type scale (xxlarge, title, subtitle, defaultBold, etc.) |
| `ThemedButton` | Button with variants (ghost, primary, etc.) and sizes |
| `ThemedInput` | Text input with theming |
| `ThemedRadio` | Radio button group |
| `ThemedSwitch` | Toggle switch |
| `ThemedRBSheet` | Bottom sheet (wraps `react-native-bottom-sheet`) |
| `ThemedCodeInput` | OTP / verification code input |
| `ThemedMarkdown` | Renders markdown with theming |
| `ThemedSearchableSelect` | Searchable dropdown selector |

### Layout / Navigation

| Component | File | Purpose |
|---|---|---|
| **Header** | `components/Header.tsx` | Top navigation bar |
| **TabBarIcon** | `components/navigation/TabBarIcon.tsx` | Tab bar icon wrapper |
| **GradientLine** | `components/GradientLine.tsx` | Decorative gradient divider |

---

## Contexts (State Management)

| Context | File | Purpose |
|---|---|---|
| **AuthContext** | `contexts/AuthContext.tsx` | Directus JWT auth. Login, register, logout, token storage. |
| **LanguageContext** | `contexts/LanguageContext.tsx` | Current L1, L2, available languages list, translations (i18n). |
| **DictionaryContext** | `contexts/DictionaryContext.tsx` | Dictionary instance (local SQLite DB). Loads dictionary data from CDN. Provides `dictionary.search()`, `dictionary.getEntry()`, tokenizer, OpenCC converter, TranslationManager. |
| **UserDataContext** | `contexts/UserDataContext.tsx` | Saved words, watch progress, watch time. Syncs to Directus. Provides `saveWord()`, `removeSavedWord()`, `hasSavedWord()`, `updateProgress()`. |
| **SettingsContext** | `contexts/SettingsContext.tsx` | App settings: traditional/simplified Chinese toggle, subtitle preferences. |
| **VideoPlayerContext** | `contexts/VideoPlayerContext.tsx` | Video playback state. Sets up video + queue, manages player instance. |
| **SubscriptionContext** | `contexts/SubscriptionContext.tsx` | Premium subscription status and IAP handling. |
| **ThemeContext** | `contexts/ThemeContext.tsx` | Light/dark theme. |
| **TVShowsContext** | `contexts/TVShowsContext.tsx` | TV shows catalog data. |

---

## Data Layer (`src/`)

### API Clients

| Module | Purpose |
|---|---|
| `src/api/directus/` | Directus REST API calls: auth, user-data CRUD, videos, TV shows |
| `src/api/python/` | Flask backend calls: video recommendations, translations |
| `src/api/` | Aggregated API exports |

### Dictionary Engine

| Module | Purpose |
|---|---|
| `src/dictionary.ts` | Main Dictionary class. Loads SQLite DB, provides `search()`, `getEntry()`, `findWordsInPhrase()`, `getWordSet()` |
| `src/dictionary-types.ts` | TypeScript types for DictionaryEntry, match types, levels |
| `src/dictionary-db.ts` | SQLite database operations |
| `src/dictionary-profile.ts` | Per-language dictionary configuration (tables, columns, CDN URLs) |
| `src/dictionary-utils.ts` | Utility functions for dictionary operations |
| `src/edict-pos.ts` | Japanese EDICT part-of-speech codes |

### Tokenizer

| Module | Purpose |
|---|---|
| `src/tokenizer/` | Multi-language tokenization (Jieba for Chinese, Mecab for Japanese, etc.). Provides TokenizerService. |

### Other Utilities

| Module | Purpose |
|---|---|
| `src/languages.ts` | Language definitions, language name lookups |
| `src/language-levels.ts` | CEFR/HSK/JLPT level mappings per language |
| `src/styles.ts` | Shared StyleSheet definitions |
| `src/storage.ts` | AsyncStorage wrapper |
| `src/StorageManager.tsx` | Time tracking storage |
| `src/QueueManager.ts` | Video queue management |
| `src/translation-manager.ts` | L1 translation caching and fetching |
| `src/speech.ts` | TTS (text-to-speech) |
| `src/furigana.ts` | Japanese furigana generation |
| `src/subs.ts` | Subtitle fetching and processing |

---

## Key Patterns

### Dictionary Architecture
1. Dictionary data is stored in a local SQLite database (`data/dictionaries.db`)
2. The DB is downloaded from CDN at app startup (DictionaryContext)
3. `Dictionary.search(text, limit)` → fuzzy search across head/alternate/pronunciation
4. `Dictionary.getEntry(id)` → fetch single entry by ID
5. All searches are local — no network call needed after initial download
6. Words link to detail page via `router.navigate('/dictionary/word/' + entry.id)`

### Word Saving Flow
1. BookmarkButton calls `saveWord(l2Code, wordMeta)` from UserDataContext
2. UserDataContext stores in local state + persists to Directus `user_data.saved_words`
3. On Saved Words page, WordList looks up full entries from local dictionary DB
4. Each word row has BookmarkButton (to remove) + navigation to word detail

### Video + Dictionary Integration
1. VideoWithTranscript renders TokenizedText (interactive subtitles)
2. Tapping a token opens PopupDictionaryModal (bottom sheet)
3. Popup shows dictionary entries for the tapped word
4. "See details →" navigates to full word detail page
5. User can bookmark from either popup or detail page

### Translation Pattern
1. `TranslationManager` caches L1 translations
2. Popup shows translated context sentence above dictionary entries
3. Fallback chain: cache → ChatGPT API → Azure Translator

### SubsSearch — Subtitle Examples with Embedded Video Player

This pattern powers the "Examples from Videos" section on the Word Detail page.
It embeds a **self-contained mini video player** that shows the word in context.

#### Architecture

```
SubsSearch (fetcher + context wrapper)
  └─ VideoWithTranscriptProvider (scoped, independent player context)
       └─ SubsSearchResults (UI orchestrator)
            ├─ VideoWithTranscript  ← mini player, one subtitle line at a time
            ├─ VideoControlBar      ← prev/next video, prev/next line, play/pause
            └─ SubsSearchResultsList ← bottom sheet with all results
```

#### Component Responsibilities

| Component | Role |
|---|---|
| **SubsSearch** | Fetches results via `subsSearch()` API. Wraps all matched videos in a scoped `VideoWithTranscriptProvider` with `initialVideo` = first match, `initialPlaylist` = all matches. |
| **SubsSearchResults** | Seeks the mini player to the matched line's timestamp. Shows "Video X of Y" counter + "List All" button. |
| **SubsSearchResultsList** | Bottom sheet with filterable/sortable scrollable list. Each row: thumbnail, title, context lines, highlighted term. Tap → `skipToVideo(index)` + `updateStartTime(timestamp)`. |
| **VideoWithTranscript** (mini) | Same component as the full watch screen, but renders **one subtitle line at a time** (the matched line ± context). Not a full scrolling transcript. |

#### Display: One Line at a Time

The mini player inside subs search does **not** show a full scrollable transcript.
Instead, it displays subtitle lines one-by-one, synced to playback:

```
┌──────────────────────────────────────┐
│  Video 1 of 12           [List All ▼]│
├──────────────────────────────────────┤
│                                      │
│       ┌──────────────────┐           │
│       │   YouTube Player │           │  ← plays at matched timestamp
│       └──────────────────┘           │
│                                      │
│  ───── Subtitle (single line) ─────  │
│  "... context before ..."            │  ← L1 translation (if enabled)
│  "... ██ matched word ██ ..."       │  ← L2 line with highlight
│  "... context after ..."             │
│                                      │
├──────────────────────────────────────┤
│  ⏮  ⬆  ⏪  ▶/⏸  ⏩  ⏭  🔄           │
│ prev next prev  play  next next rewind│
│ vid  line line       line  vid       │
└──────────────────────────────────────┘
```

#### API Call

```ts
subsSearch(
  [term],           // search terms
  l2Code,           // target language
  undefined,        // category filter
  videoCount > 50000 ? 'nnull' : undefined,  // TV show filter for large langs
  50,               // limit
  5,                // context lines around match
)
// → GET /subs-search?terms=word&l2=zh&limit=50&context=5
```

Backend (Python `app_subs_search.py`):
1. Checks cache (keyed by terms + filters)
2. Queries `youtube_videos{suffix}` with MySQL `MATCH ... AGAINST IN BOOLEAN MODE` (FULLTEXT) or `LIKE %term%` fallback
3. `reduce_video_subs_to_context()` trims each video's `subs_l2` CSV to ±5 lines around matches
4. Returns JSON array of videos with trimmed subtitle CSV

#### Free Tier Gating

Free users are limited to **3 results**. When `currentVideoIndex >= 3`:
- Reverts to previous index
- Shows `ProFeatureModal` upgrade prompt

#### Player Controls

The mini player's `VideoControlBar` provides full navigation within the subs search playlist:

| Icon | Action |
|---|---|
| `play-skip-back` | Previous video in results |
| `arrow-back` | Previous subtitle line |
| ▶ / ❚❚ | Play / Pause |
| `arrow-forward` | Next subtitle line |
| `play-skip-forward` | Next video in results |
| `refresh-circle` | Rewind to previous line |

#### Sort Options in List View

| Sort | Description |
|---|---|
| Popularity | By views (descending) |
| Likes | By likes (descending) |
| Date | By upload date (newest first) |
| Length | By matched line length |
| Left Context | Grouped by character immediately before the term |
| Right Context | Grouped by character immediately after the term |

The Left/Right Context sorts reveal pronunciation and collocation patterns — e.g., for Chinese, grouping by the preceding character shows common compound words.

#### Key Design Decisions

- **Nested VideoWithTranscriptProvider**: Creates an independent player context scoped to subs search. Does not interfere with the global `VideoPlayerContext` or any other player instance.
- **Term-centric, not entry-centric**: Search is by the word string, not dictionary entry ID. Works across all videos regardless of dictionary structure.
- **CSV subs_l2 with context trimming**: Server trims subtitle CSV to ±context lines before sending, saving bandwidth.
- **One-line-at-a-time display**: Unlike the full watch page's scrollable transcript, the subs search player shows a single line synced to playback — focused on the word in context.

---

## Settings Architecture

> **REFERENCE.** This documents how GO app settings work. The Next.js migration target design is in `specs/007-settings-architecture.md`.

### Settings Shape

**File:** `contexts/SettingsContext.tsx` — Flat structure (not per-L2):

```typescript
interface SettingsState {
  showPinyin: boolean;        // default: true
  showDefinition: boolean;    // default: false
  useTraditional: boolean;    // default: false
  showTranslation: boolean;   // default: true
  showQuickGloss: boolean;    // default: true
  autoPronounce: boolean;     // default: true
  darkMode: boolean;          // default: true
  quizMode: boolean;          // default: false
  l1LangCode: string;         // default: ''  (cached from LanguageContext)
  l2LangCode: string;         // default: ''  (cached from LanguageContext)
}
```

**Key difference from Classic:** Settings are **global, not per-language**. Changing `showPinyin` for Chinese also changes it for Japanese — there is no `l2Settings[l2Code]` nesting.

**Key difference from Classic:** `darkMode` is a boolean (`true`/`false`), not a string (`"dark"`/`"light"`).

### Storage

| Property | Value |
|---|---|
| **Primary store** | React `useReducer` in `SettingsContext` |
| **Storage key** | `userSettings` |
| **Storage backend** | `expo-secure-store` (native iOS/Android) / `localStorage` (web fallback) via `src/storage.ts` |
| **Format** | Single flat JSON object |
| **Persistence trigger** | `useEffect` — auto-saves whenever `settings` state changes, but only after `l1LangCode` and `l2LangCode` are both set |
| **Load trigger** | `useEffect` on mount — reads from secure store, dispatches `SET_SETTINGS` |
| **Server storage** | ❌ Not synced — settings are device-local only |
| **Conflict resolution** | N/A — local only |

**Saved shape on disk:**
```json
{
  "showPinyin": true,
  "showDefinition": false,
  "useTraditional": false,
  "showTranslation": true,
  "showQuickGloss": true,
  "autoPronounce": true,
  "darkMode": true,
  "quizMode": false,
  "l1LangCode": "en",
  "l2LangCode": "zh"
}
```

**All storage keys in the GO app:**

| Key | Storage | Purpose |
|---|---|---|
| `userSettings` | `expo-secure-store` | Settings JSON blob |
| `authToken` | `expo-secure-store` | JWT auth token |
| `userInfo` | `expo-secure-store` | User profile JSON |
| `tempPassword` | `expo-secure-store` | Temporary password |
| `userProgressTime` | `expo-secure-store` | Accumulated watch time (ms) |

`StorageManager` (`src/StorageManager.tsx`) holds in-memory cache for `authToken`, `userInfo`, `userData`, `tempPassword`. `userData` is memory-only (not persisted to disk).

### Change Flow

```
Component calls dispatch({ type, payload })
  │
  │  Three action types:
  │    SET_SETTINGS    — bulk merge (Partial<SettingsState>)
  │    TOGGLE_SETTING  — flip a boolean by key name
  │    SET_L1_LANG_CODE / SET_L2_LANG_CODE
  │
  ▼
useReducer(settingsReducer, initialState)
  │  State updated
  │
  ▼
useEffect (auto-save)
  → if (l1LangCode && l2LangCode)
  → secureStorage.setItemAsync('userSettings', JSON.stringify(settings))

❌ No server sync
```

**Settings screen** (`app/settings.tsx`): Renders each setting as a `ThemedSwitch`. The screen toggles settings via:
```typescript
const { settings, dispatch } = useSettings();
const toggleSetting = (key: keyof SettingsState) => {
  dispatch({ type: 'TOGGLE_SETTING', payload: key });
};
```

Rendered toggles: `showPinyin`, `useTraditional` (zh only), `showTranslation`, `showQuickGloss`, `quizMode`, `autoPronounce`, `darkMode`.

**Language code sync:** When the user selects L1/L2 on onboarding screens, `LanguageContext.setL1Lang()` / `setL2Lang()` update the language context. `SettingsContext` has `useEffect` watchers that sync the codes from `LanguageContext` into settings state automatically.

### Sync

**Settings are NOT synced to the backend.** Only `UserData` (saved_words + progress) is synced.

`UserDataContext` (`contexts/UserDataContext.tsx`) syncs `saved_words` and `progress` to Directus every 60 seconds (`SYNC_INTERVAL = 60000`). The API calls are in `src/api/directus/user-data.ts`:

```typescript
// Fetch
getUserData(authToken?) → GET items/user_data
// Update
patchUserData(id, updatedData, authToken?) → PATCH items/user_data/{id}
// Create
initializeUserData(authToken?) → POST items/user_data
```

The `UserData` shape stored in Directus:
```typescript
interface UserData {
  id: string;
  saved_words: SavedWords;   // { [langCode]: SavedWordMeta[] }
  progress: Progress;        // { [langCode]: { level?, time } }
}
```

Settings (`showPinyin`, `darkMode`, etc.) are **purely device-local**. They do not roam across devices.

### Context Dependencies

The provider nesting order determines how settings flow to other contexts:

```
LanguageProvider
  └─ AuthProvider
      └─ SubscriptionProvider
          └─ UserDataProvider
              └─ SettingsProvider        ← depends on LanguageProvider
                  └─ DictionaryProvider  ← depends on SettingsProvider (useTraditional → OpenCC)
                      └─ ThemeProvider   ← depends on SettingsProvider (darkMode → theme)
                          └─ TVShowsProvider
                              └─ VideoPlayerProvider
```

- **DictionaryContext** reads `settings.useTraditional` to choose OpenCC converter direction (simplified ↔ traditional)
- **ThemeContext** reads `settings.darkMode` to set React Navigation theme (DarkTheme / DefaultTheme)
- **Token** component reads `showPinyin`, `showQuickGloss`, `quizMode`
- **PopupDictionaryHeader** reads `autoPronounce` to trigger TTS on popup open

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Device                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │  expo-secure-store / localStorage (web fallback) │   │
│  │  userSettings = "{ showPinyin, darkMode, ... }"  │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ load/save via secureStorage             │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │           SettingsContext (useReducer)             │   │
│  │  state: { showPinyin, darkMode, useTraditional }  │   │
│  │  dispatch: SET_SETTINGS | TOGGLE_SETTING |        │   │
│  │            SET_L1_LANG_CODE | SET_L2_LANG_CODE    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ❌ No server sync for settings                          │
│  ✅ UserDataContext syncs saved_words + progress only     │
│     (every 60s to Directus user_data)                    │
└─────────────────────────────────────────────────────────┘
```

---

## Navigation Patterns

- **Tab navigation**: 3 tabs (Media, Dictionary, Me) via Expo Router Tabs
- **Stack navigation**: Push screens within tabs (e.g., Dictionary → Word Detail, Media → TV Shows)
- **Modal**: PopupDictionaryModal uses RBSheet (bottom sheet), not a route
- **Deep linking**: Word detail pages linked by entry ID (`/dictionary/word/[id]`)

---

## What the Next.js App Should Implement

Based on GO's architecture, the Next.js `apps/web/` should have:

| GO Screen | Next.js Route | Status |
|---|---|---|
| Dictionary Search | `/[l1]/[l2]/dictionary` | ✅ Implemented |
| Word Detail | `/[l1]/[l2]/dictionary/word/[word]` | ✅ Implemented |
| Saved Words | `/[l1]/[l2]/saved-words` | ✅ Implemented |
| SubsSearch Examples | `/[l1]/[l2]/dictionary/word/[word]` (inline) | ✅ Implemented (link-to-watch) |
| Media Home | `/[l1]/[l2]/explore` | ✅ Implemented |
| TV Shows | `/[l1]/[l2]/tv-shows` | ✅ Implemented |
| Progress | `/[l1]/[l2]/progress` | ❌ Future |

### Word Detail Page — Implementation Notes
- Route: `/[l1]/[l2]/dictionary/word/[id]`
- Reuse `DictionaryEntryCard` component (from `components/dictionary-entry-card.tsx`)
- Show: large head word, alt script, pronunciation, level badge, BookmarkButton, full definitions, example sentences from videos
- Navigate from dictionary search results and saved words list via entry ID
- Back button to return to search/saved-words
