# Language Player Classic — App Architecture Reference

> Analysis of `zerotohero-nuxt/` (Vue 2 / Nuxt 2).
> This is the **source of truth** for features. All Next.js implementations should reference this first.
> **DO NOT EDIT** files in this directory.

## Tech Stack

- **Framework**: Nuxt 2 (Vue 2) with Vuex, Vue Router, BootstrapVue
- **UI**: Bootstrap 4 + custom themed components + Font Awesome
- **State**: Vuex (22 store modules) + localStorage persistence
- **Backend**: Directus 8 (headless CMS) + Python Flask API
- **Auth**: Directus JWT (stored in cookies via Nuxt Auth module)
- **Dictionary**: Python Flask `/dictionary/lookup` endpoint (server-side)
- **i18n**: nuxt-i18n with JSON translation files

---

## Route Map (Nuxt Pages)

Nuxt uses file-based routing. Language-scoped routes live under `pages/_l1/_l2/`.

```
pages/
├── index.vue                         ← Home landing page
├── login.vue / register.vue          ← Auth
├── forgot-password.vue / password-reset.vue
├── verify-email.vue / delete-account.vue
├── go-pro.vue / go-pro-success.vue   ← Subscription
├── dashboard.vue                     ← Admin dashboard
├── languages.vue                     ← All languages browser
├── language-map.vue                  ← Language map visualization
├── popular.vue                       ← Popular languages
├── stats.vue                         ← Site statistics
├── compare-languages.vue             ← Language comparison tool
├── articles.vue                      ← Blog/articles
├── translators.vue                   ← Translator credits
├── discover-shows.vue                ← TV shows discovery
│
└── _l1/
    └── _l2/                          ← All language-scoped pages
        ├── index.vue                 ← Language home / dashboard
        ├── explore-media.vue         ← Media home: VideoHero + recommendations
        ├── dictionary.vue            ← Dictionary search (SearchCompare)
        ├── saved-words.vue           ← Vocabulary list (grouped by date)
        ├── saved-phrases.vue         ← Saved phrases list
        ├── saved-words-games.vue     ← Vocabulary games / quizzes
        ├── learn.vue                 ← Learning path overview
        ├── learning-path.vue         ← Structured learning path
        ├── levels.vue                ← Proficiency level browser
        ├── language-info.vue         ← Language facts & attributes
        ├── profile.vue               ← User profile / settings
        ├── settings.vue              ← Language-specific settings
        ├── set-language-level.vue    ← Set proficiency level
        ├── set-content-preferences.vue ← Content preferences
        │
        ├── reader.vue                ← Text reader
        ├── epub.vue                  ← EPUB reader
        ├── web-reader.vue            ← Web article reader
        ├── gutenberg.vue             ← Project Gutenberg browser
        │
        ├── books.vue                 ← Books browser
        ├── music.vue                 ← Music browser
        ├── tv-shows.vue              ← TV Shows browser
        ├── live-tv.vue               ← Live TV browser
        ├── audiobooks.vue            ← Audiobooks browser
        ├── talks.vue                 ← Talks browser
        │
        ├── library.vue               ← Full media library
        ├── categories.vue            ← Categories browser
        ├── feed.vue                  ← Activity feed
        ├── updates.vue               ← Site updates
        │
        ├── video-view/               ← Video player
        │   └── _type.vue             ← Full video player with transcript
        ├── youtube/                  ← YouTube section
        │   ├── search.vue            ← YouTube search
        │   ├── channels.vue          ← YouTube channels
        │   ├── channel.vue           ← Single channel
        │   ├── playlist.vue          ← Playlist view
        │   ├── subscriptions.vue     ← Subscriptions
        │   ├── history.vue           ← Watch history
        │   ├── likes.vue             ← Liked videos
        │   ├── import.vue            ← Import from YouTube
        │   └── browse/               ← Browse by category
        ├── show/                     ← TV Show detail
        ├── book/                     ← Book reader
        ├── phrase/                   ← Phrase detail
        ├── phrasebook/               ← Phrasebook detail
        ├── playlist/                 ← Playlist detail
        ├── category/                 ← Category detail
        ├── resource/                 ← Resource detail
        ├── articles/                 ← Articles (per language)
        ├── grammar/                  ← Grammar reference
        ├── chinese/                  ← Chinese-specific (pinyin, strokes)
        ├── hindi/                    ← Hindi-specific
        ├── klingon/                  ← Klingon-specific
        └── tutoring/                 ← Tutoring section
```

---

## Vuex Store Modules

All stores persist to localStorage via `vuex-persist` plugin.

| Store Module | File | Purpose |
|---|---|---|
| **savedWords** | `store/savedWords.js` | Per-L2 saved words. ADD_SAVED_WORD, REMOVE_SAVED_WORD, form/id indexing. localStorage key: `zthSavedWords`. |
| **savedPhrases** | `store/savedPhrases.js` | Saved phrases (multi-word expressions). |
| **savedCollocations** | `store/savedCollocations.js` | Saved collocations. |
| **savedHits** | `store/savedHits.js` | Saved subtitle search hits. |
| **savedText** | `store/savedText.js` | Saved text passages. |
| **progress** | `store/progress.js` | Per-L2 learning progress (level, time). localStorage key: `zthProgress`. |
| **settings** | `store/settings.js` | Per-L2 display settings (showPinyin, useTraditional, showDefinition, quizMode, zoomLevel, autoPronounce, voice, etc.). |
| **history** | `store/history.js` | Recently viewed pages. |
| **watchHistory** | `store/watchHistory.js` | Recently watched videos. |
| **fullHistory** | `store/fullHistory.js` | Full browsing history. |
| **channels** | `store/channels.js` | YouTube channels data. |
| **channelPreferences** | `store/channelPreferences.js` | User channel preferences. |
| **playlists** | `store/playlists.js` | Playlists data. |
| **phrasebooks** | `store/phrasebooks.js` | Phrasebooks data. |
| **bookshelf** | `store/bookshelf.js` | User's bookshelf (saved books). |
| **shows** | `store/shows.js` | TV shows data. |
| **stats** | `store/stats.js` | User statistics. |
| **subscriptions** | `store/subscriptions.js` | Subscription status. |
| **userLikes** | `store/userLikes.js` | User likes. |
| **chatGPTCache** | `store/chatGPTCache.js` | Cached ChatGPT responses. |

---

## Key Components

### Dictionary & Words

| Component | File | Purpose |
|---|---|---|
| **WordBlock** | `components/WordBlock.vue` | Interactive word token in subtitle/text. Shows reading (ruby), definition, level color. Click opens popup. Core of the reading experience. |
| **WordBlockPopup** | `components/WordBlockPopup.vue` | Dictionary popup content. Shows: images, lemmas, pronunciation, matched entries (EntryHeader), translation, ChatGPT explanation. |
| **WordBlockDictionary** | `components/WordBlockDictionary.vue` | Lists dictionary entries inside a popup. Each entry has: head, pronunciation, level, definitions, Save button. |
| **WordList** | `components/WordList.vue` | Renders a list of words (async computed). Each word shows: head, pronunciation, definitions, Star button, Speak button. |
| **WordListItem** | `components/WordListItem.vue` | Single word row in a list. |
| **WordCard** | `components/WordCard.vue` | Word card with full details. |
| **DictionaryEntry** | `components/DictionaryEntry.vue` | Full dictionary entry view (level, characters, examples, YouTube). |
| **EntryHeader** | `components/EntryHeader.vue` | Word entry header: head, alt, pronunciation, level, Star. |
| **EntryCharacters** | `components/EntryCharacters.vue` | Han character decomposition. |
| **EntryDifficulty** | `components/EntryDifficulty.vue` | Proficiency level badge. |
| **EntryDisambiguation** | `components/EntryDisambiguation.vue` | Disambiguation links for homographs. |
| **EntryExample** | `components/EntryExample.vue` | Example sentences. |
| **EntryExternal** | `components/EntryExternal.vue` | External dictionary links. |
| **EntryForms** | `components/EntryForms.vue` | Word forms (inflections, compounds). |
| **EntryRelated** | `components/EntryRelated.vue` | Related words. |
| **EntryYouTube** | `components/EntryYouTube.vue` | YouTube examples for a word. |
| **EntryCourseAd** | `components/EntryCourseAd.vue` | Course advertisement inside entry. |
| **DefinitionsList** | `components/DefinitionsList.vue` | List of definitions with numbering. |
| **SearchCompare** | `components/SearchCompare.vue` | Dictionary search bar with type-ahead. Used on dictionary page. |
| **SimpleSearch** | `components/SimpleSearch.vue` | Simple search input. |
| **SearchSubsComp** | `components/SearchSubsComp.vue` | Search subtitle lines for a word. |
| **CompareSearchSubs** | `components/CompareSearchSubs.vue` | Compare word usage across subtitle corpora. |
| **CompareDefs** | `components/CompareDefs.vue` | Compare definitions across dictionaries. |
| **CompareCollocations** | `components/CompareCollocations.vue` | Compare collocations across corpora. |
| **Concordance** | `components/Concordance.vue` | KWIC concordance view. |
| **Frequency** | `components/Frequency.vue` | Word frequency information. |
| **PhraseComp** | `components/PhraseComp.vue` | Phrase display component. |
| **PhraseHeader** | `components/PhraseHeader.vue` | Phrase header with save button. |

### Save / Bookmark

| Component | File | Purpose |
|---|---|---|
| **Star** | `components/Star.vue` | Toggle save/unsave word. Shows outline star (not saved) → filled star with checkmark (saved). Animates on save. Used in popups and word lists. |
| **SmallStar** | `components/SmallStar.vue` | Compact star button variant. |
| **Saved** | `components/Saved.vue` | Generic save toggle (used for phrases, collocations, etc.). |
| **SavedWordsAndPhrases** | `components/SavedWordsAndPhrases.vue` | Combined saved words + phrases view. |

### Popup / Modal

| Component | File | Purpose |
|---|---|---|
| **PopupDictionaryModal** | `components/PopupDictionaryModal.vue` | Bootstrap modal for dictionary lookup. Wraps WordBlockPopup. Emits popupOpened/popupClosed events. |
| **PopupNote** | `components/PopupNote.vue` | Note-taking popup for words. |
| **PlaylistModal** | `components/PlaylistModal.vue` | Add-to-playlist modal. |
| **TokenizedTextMenuModal** | `components/TokenizedTextMenuModal.vue` | Context menu for tokenized text. |

### Video / Media

| Component | File | Purpose |
|---|---|---|
| **VideoHero** | `components/VideoHero.vue` | Featured video banner. |
| **VideoComp** | `components/VideoComp.vue` | Main video player wrapper. |
| **VideoControls** | `components/VideoControls.vue` | Play/pause, speed, subtitle toggle, AB repeat. |
| **VideoDetails** | `components/VideoDetails.vue` | Video metadata (title, channel, description). |
| **VideoWithTranscript** | `components/VideoWithTranscript.vue` | Video player + synced transcript side-by-side. |
| **VideoViewComp** | `components/VideoViewComp.vue` | Full video view layout. |
| **SyncedTranscript** | `components/SyncedTranscript.vue` | Scrollable transcript synced to video. |
| **TranscriptLine** | `components/TranscriptLine.vue` | Single transcript line with timestamp. |
| **TokenizedText** | `components/TokenizedText.vue` | Subtitle line with clickable WordBlocks. |
| **TokenizedRichText** | `components/TokenizedRichText.vue` | Rich text version of TokenizedText. |
| **YouTubeVideo** | `components/YouTubeVideo.vue` | Single YouTube video player. |
| **YouTubeVideoList** | `components/YouTubeVideoList.vue` | Grid/list of YouTube video cards. |
| **YouTubeVideoCard** | `components/YouTubeVideoCard/` | Video card with thumbnail, title, progress bar, difficulty. |
| **YouTubeSearchResults** | `components/YouTubeSearchResults.vue` | YouTube search results list. |
| **YouTubeChannelCard** | `components/YouTubeChannelCard.vue` | Channel card. |
| **YouTubeViewComp** | `components/YouTubeViewComp.vue` | YouTube section layout. |
| **YouTubeNav** | `components/YouTubeNav.vue` | YouTube section navigation. |
| **YouTubePlaylists** | `components/YouTubePlaylists.vue` | YouTube playlists browser. |
| **LiveVideo** | `components/LiveVideo.vue` | Live TV video player. |
| **DiscoverPlayer** | `components/DiscoverPlayer.vue` | Discovery mode video player. |
| **ShowCard** | `components/ShowCard.vue` | TV show card. |
| **ShowList** | `components/ShowList.vue` | TV shows list. |
| **ShowBadge** | `components/ShowBadge.vue` | Show difficulty/type badge. |
| **ShowFilter** | `components/ShowFilter.vue` | TV show filter controls. |
| **EpisodeNav** | `components/EpisodeNav.vue` | Episode navigation. |
| **ChannelCard** | `components/ChannelCard.vue` | Channel card. |
| **ChannelList** | `components/ChannelList.vue` | Channel list. |
| **MediaSearchResults** | `components/MediaSearchResults.vue` | Media search results. |
| **MediaItemStats** | `components/MediaItemStats.vue` | Media item statistics. |
| **MiniPlayer** | `components/MiniPlayer.vue` | Minimized persistent video player. |

### Reader / Text

| Component | File | Purpose |
|---|---|---|
| **ReaderComp** | `components/ReaderComp.vue` | Main text reader with interactive word blocks. |
| **ReaderLink** | `components/ReaderLink.vue` | Link to open text in reader. |
| **EpubReader** | `components/EpubReader.vue` | EPUB reader. |
| **TextCard** | `components/TextCard.vue` | Text item card. |
| **TextWithSpeechBar** | `components/TextWithSpeechBar.vue` | Text with TTS controls. |
| **BookCard** | `components/BookCard.vue` | Book item card. |
| **Resource** | `components/Resource.vue` | Resource item. |
| **ResourceList** | `components/ResourceList.vue` | Resource list. |

### Learning & Review

| Component | File | Purpose |
|---|---|---|
| **Review** | `components/Review.vue` | Spaced repetition review. |
| **ReviewAnswerButton** | `components/ReviewAnswerButton.vue` | Answer quality buttons (1-5). |
| **ReviewItemCollector** | `components/ReviewItemCollector.vue` | Collects items for review. |
| **Drill** | `components/Drill.vue` | Vocabulary drill. |
| **DrillFSI** | `components/DrillFSI.vue` | FSI-style drill. |
| **Flashcard** | `components/Flashcard.vue` | Flashcard component. |
| **PopQuiz** | `components/PopQuiz.vue` | Popup quiz. |
| **EndQuiz** | `components/EndQuiz.vue` | End-of-video quiz. |
| **Quiz** | (referenced) | Quiz component. |
| **StudySheet** | `components/StudySheet.vue` | Printable study sheet. |
| **Speak** | `components/Speak.vue` | TTS speak button. |
| **MakeAStory** | `components/MakeAStory.vue` | AI story generator from words. |
| **HideDefs** | `components/HideDefs.vue` | Toggle to hide definitions (self-test). |
| **WordPronunciation** | `components/WordPronunciation.vue` | Pronunciation display. |

### Layout & Navigation

| Component | File | Purpose |
|---|---|---|
| **MyLayout** | `layouts/MyLayout.vue` | Main app layout shell. |
| **NavMain** | `components/NavMain.vue` | Main navigation bar. |
| **NavSecondary** | `components/NavSecondary.vue` | Secondary navigation. |
| **NavPage** | `components/NavPage.vue` | In-page navigation links. |
| **NavItem** | `components/NavItem.vue` | Navigation item. |
| **Footer** | `components/Footer.vue` | Site footer. |
| **Page** | `components/Page.vue` | Generic page wrapper. |
| **SiteTopBar** | `components/SiteTopBar/` | Top announcement bar. |
| **Logo** | `components/Logo.vue` | Site logo. |
| **LanguageSwitch** | `components/LanguageSwitch.vue` | L1/L2 language switcher. |
| **Locale** | `components/Locale.vue` | UI locale switcher. |

### Language Info

| Component | File | Purpose |
|---|---|---|
| **LanguageInfoBox** | `components/LanguageInfoBox.vue` | Language facts box. |
| **LanguageAttributes** | `components/LanguageAttributes.vue` | Language attributes display. |
| **LanguageFlag** | `components/LanguageFlag.vue` | Language flag icon. |
| **LanguageList** | `components/LanguageList.vue` | Language list. |
| **LanguageListItem** | `components/LanguageListItem.vue` | Language list item. |
| **LanguageMap** | `components/LanguageMap.vue` | Language map visualization. |
| **LanguageProgress** | `components/LanguageProgress.vue` | Language learning progress. |
| **LanguageLevel** | `components/LanguageLevel.vue` | Proficiency level display. |
| **FiftySixEthnic** | `components/FiftySixEthnic.vue` | 56 ethnic groups (Chinese). |
| **IdenticalLanguages** | `components/IdenticalLanguages.vue` | Related languages suggestions. |
| **PopularLanguagePairs** | `components/PopularLanguagePairs.vue` | Popular L1-L2 pairs. |

### Other Key Components

| Component | File | Purpose |
|---|---|---|
| **ChatGPT** | `components/ChatGPT.vue` | ChatGPT/DeepSeek AI assistant. Explains words, grammar, generates examples. |
| **Grammar** | `components/Grammar.vue` | Grammar reference component. |
| **GrammarChart** | `components/GrammarChart.vue` | Grammar chart visualization. |
| **GrammarPoint** | `components/GrammarPoint.vue` | Single grammar point. |
| **Chinese** | `components/Chinese.vue` | Chinese-specific component. |
| **Japanese** | `components/Japanese.vue` | Japanese-specific component. |
| **Korean** | `components/Korean.vue` | Korean-specific component. |
| **PinyinChart** | `components/PinyinChart.vue` | Chinese pinyin chart. |
| **PinyinSquaredCharacter** | `components/PinyinSquaredCharacter.vue` | Pinyin-squared character display. |
| **Character** | `components/Character.vue` | Han character display. |
| **CharacterList** | `components/CharacterList.vue` | Han character list. |
| **Decomposition** | `components/Decomposition.vue` | Character decomposition. |
| **StrokeOrder** | `components/StrokeOrder.vue` | Stroke order animation. |
| **WebImages** | `components/WebImages.vue` | Image wall for words. |
| **LikesComp** | `components/LikesComp.vue` | Like/dislike buttons. |
| **Share** | `components/Share.vue` | Social share buttons. |
| **SocialHead** | `components/SocialHead.vue` | SEO/meta tags. |
| **SocialLogos** | `components/SocialLogos.vue` | Social media logos. |
| **Loader** | `components/Loader.vue` | Loading spinner. |
| **Toggle** | `components/Toggle.vue` | Toggle switch. |
| **FilterDropdown** | `components/FilterDropdown.vue` | Filter dropdown. |
| **Paginator** | `components/Paginator.vue` | Pagination component. |
| **ShowMoreButton** | `components/ShowMoreButton.vue` | Show more/less toggle. |
| **TabbedSections** | `components/TabbedSections.vue` | Tabbed content sections. |
| **VersionInfo** | `components/VersionInfo.vue` | App version info. |
| **Changelog** | `components/Changelog.vue` | Changelog display. |
| **FeedbackButton** | `components/FeedbackButton.vue` | User feedback button. |

---

## Plugins

| Plugin | File | Purpose |
|---|---|---|
| **directus.js** | `plugins/directus.js` | Directus SDK initialization. Injects `$directus` into Nuxt context. |
| **main.js** | `plugins/main.js` | Main app initialization. Sets up language detection, dictionary loading, auth state. |
| **global-mixin.js** | `plugins/global-mixin.js` | Global Vue mixin with helper methods. |
| **subs.js** | `plugins/subs.js` | Subtitle processing plugin. |
| **vuex-persist.js** | `plugins/vuex-persist.js` | Persists Vuex state to localStorage. |
| **shared-mutations.js** | `plugins/shared-mutations.js` | Cross-tab Vuex mutation sharing. |
| **pwa-update.js** | `plugins/pwa-update.js` | PWA update notification. |
| **stripe.js** | `plugins/stripe.js` | Stripe payment integration. |
| **paypal.js** | `plugins/paypal.js` | PayPal payment integration. |
| **ios-in-app-purchase.js** | `plugins/ios-in-app-purchase.js` | iOS IAP integration. |
| **idle-vue.js** | `plugins/idle-vue.js` | Idle detection. |

---

## Lib Utilities

### `lib/utils/` — Core Utility Modules

The `lib/utils/` directory contains 20+ focused utility modules, re-exported through `lib/utils/index.js`:

| File | Key Exports | Purpose |
|---|---|---|
| `index.js` | (barrel) | Re-exports all sub-modules. Also defines `unlessUndefined()`, `parseTime()`, `getYearTitle()`. |
| `array.js` | `findRandomUniqueElementsFromArray`, `randomItemFromArray`, `uniqueByValue`, `uniqueByValues`, `uniqueSort`, `flatten`, `groupArrayBy`, `unique`, `mutuallyExclusive` | Array manipulation: dedup, group-by, flatten, random picks, mutual-exclusion filtering. |
| `background.js` | `getDefaultBackground`, `backgroundKeyword`, `unsplashUrl`, `background` | Dynamic background images: daily rotating default, Unsplash integration by language/country. |
| `countries.js` | `country` | Country lookup by ISO code from `lib/countries.js` data. |
| `device.js` | `isMobile`, `iOS` | Device/browser detection (mobile, iOS). |
| `error.js` | `logError` | Structured error logging with Axios response details. |
| `exams.js` | `EXAMS` (default export) | Exam system definitions: HSK (zh), JLPT (ja), TOPIK (ko), IELTS (en), CEFR (all). Array of `{ lang, slug, name }`. |
| `japanese.js` | `smallKanaSet`, `splitIntoMoras`, `addPitchAccent` | Japanese text processing: kana identification, mora splitting, pitch accent annotation. |
| `language-levels.js` | `LEVELS`, `MAX_DIFFICULTY_BY_LEVEL` | 7-level proficiency scale mapping HSK/CEFR/JLPT/TOPIK/IELTS. Per-L2 max-difficulty thresholds for content filtering. |
| `proxy.js` | `proxy`, `proxyParsed` | URL fetching via caching proxy server with HTML parsing. |
| `random.js` | `randomInt`, `randomArrayItem`, `randBase64` | Random number/item/string generation. |
| `regex.js` | `CJK`, `NON_CJK`, `characterClass`, `escapeRegExp` | Unicode regex constants: CJK/non-CJK character ranges, Unicode character class builders (Letter, Han, Hangul, Kana, Punctuation variants). |
| `sample-text.js` | `SAMPLE_TEXT` (default export) | Per-language sample text strings for the reader/dictionary demos (zh, es, de, fr, ko, ja, en, it, eu, vi, ca, ru). |
| `servers.js` | `SERVER`, `PYTHON_SERVER`, `DIRECTUS_URL`, `WEB_URL`, `PROXY_URL`, `SCRAPE_URL`, etc. | Server URL constants for all backend services (Directus, Python, proxy, image, YouTube endpoints). |
| `special-languages.js` | `SPECIAL_LANGUAGES` (default export) | Special language mappings (e.g., Classical Chinese → zh, Middle Chinese → zh, Hakka → zh). |
| `speech-singleton.js` | `SpeechSingleton` (class) | TTS singleton wrapping Web Speech API: voice selection, speak with rate control, pause/resume, onboundary events. |
| `string.js` | `roundTo`, `normalizeStylizedNumber`, `unescape`, `splitByReg`, `highlight`, `highlightMultiple`, `STYLIZED_NUMBERS`, `transliterate`, `titleCase`, `parseBool`, `anyToBool`, `stringToColor`, `containsSpecialChars`, `deburr`, `sortByLength` | String manipulation: HTML unescaping, stylized number normalization (①→1), regex highlighting, transliteration, case conversion, sorting. |
| `timeout.js` | `timeout` | Promise-based `setTimeout` wrapper: `await timeout(ms)`. |
| `unique-id.js` | `uniqueId` | UUID v4 generator via the `uuid` package. |
| `url.js` | `absoluteURL`, `queryString`, `baseUrl`, `HOST` | URL utilities: resolve relative/absolute URLs, build query strings, extract base URL/host. |
| `variables.js` | `TEST`, `SALE`, `SALE_DISCOUNT`, `DEFAULT_PAGE`, `NON_PRO_MAX_LINES`, `NON_PRO_MAX_SUBS_SEARCH_HITS`, `LANGS_WITH_CONTENT`, `LANGS_YOUTUBE_SUPPORTS`, `LANGS_WITH_LIVE_TV` | Global app variables: sale/discount config, free-user content limits (max transcript lines, max subs search hits), language allow-lists for content/YouTube/live TV. |
| `viewport.js` | `wide`, `tall`, `landscape`, `documentOffsetTop`, `scrollToTargetAdjusted` | Viewport/scroll helpers: breakpoint detection (wide > 991px, tall > 557px, landscape > 13:9), smooth scroll-to-element with header offset. |

### Other Lib Modules

| File | Purpose |
|---|---|
| `lib/helper.js` | General helper functions (groupArrayBy, logError, etc.) |
| `lib/languages.js` | Language definitions, names, codes, scripts |
| `lib/language-mapper.js` | Language mapping/normalization |
| `lib/config.js` | App configuration |
| `lib/translators.js` | Translation service integrations |
| `lib/youtube.js` | YouTube API helpers |
| `lib/character.js` | Chinese character utilities |
| `lib/hanzi.js` | Hanzi processing |
| `lib/pinyin-mapping.js` / `lib/pinyin-squared.js` | Pinyin utilities |
| `lib/pinyin-to-character.js` | Pinyin-to-character conversion |
| `lib/unihan.js` | Unihan database utilities |
| `lib/grammar.js` | Grammar definitions |
| `lib/klingon.js` | Klingon language utilities |
| `lib/dewey.js` | Dewey classification for books |
| `lib/sketch-engine.js` | Sketch Engine corpus integration |
| `lib/library.js` / `lib/library-sources/` / `lib/library-l2s/` | Media library definitions |
| `lib/timer.js` | Timer utilities |
| `lib/date-helper.js` | Date formatting |
| `lib/countries.js` | Country data |
| `lib/prices.js` | Pricing configuration |
| `lib/word-photos.js` | Word photo/image utilities |
| `lib/merge-hsk-cedict.js` | HSK-CEDICT merge utilities |
| `lib/simplify-ecdict.js` | ECDICT simplification |
| `lib/module-loader.js` / `lib/worker-module-loader.js` | Dynamic module/worker loading |

---

## `static/js/` — Client-Side Dictionaries, Tokenizers & Inflectors (Web Workers)

The `static/js/` directory runs in Web Workers for offline-capable, non-blocking dictionary lookup, tokenization, and inflection. These are loaded via `importScripts()` at runtime.

### Dictionary Classes (extend `BaseDictionary`)

| File | Class | Language(s) | Data Source | Purpose |
|---|---|---|---|---|
| `base-dictionary.js` | `BaseDictionary` | (base class) | — | Shared dictionary logic: IndexedDB/localforage persistence, Fuse.js fuzzy search, word-level/phrase-level indices, tokenizer+inflector wiring, frequency assignment. All dictionary classes extend this. |
| `hsk-cedict-dictionary.js` | `HskCedictDictionary` | `zh` (Chinese) | CC-CEDICT + HSK level annotations + character data | Chinese dictionary with simplified/traditional indices, HSK level assignment, character decomposition. |
| `edict-dictionary.js` | `EdictDictionary` | `ja` (Japanese) | JMdict/EDICT + Wiktionary CSV + accent data | Japanese dictionary with kanji/kana/romaji indices, pitch accent data, POS (part-of-speech) lookup table. |
| `kdic-jc-dictionary.js` | `KdicJcDictionary` | `ja` → `zh` (J→C) | StarDict kdic-jc | Japanese→Chinese dictionary. Kana/romaji indices, wanakana romanization. |
| `kengdic-dictionary.js` | `KengdicDictionary` | `ko` (Korean) | kengdic 2011 + Wiktionary CSV | Korean dictionary (L1=English) with hanja support. Merges kengdic + Wiktionary data. |
| `open-russian-dictionary.js` | `OpenRussianDictionary` | `ru` (Russian) | OpenRussian.org + Wiktionary CSV | Russian dictionary with accent marks, merged with Wiktionary supplement. |
| `russian-legacy.js` | `RussianLegacy` (IIFE) | `ru` (Russian) | Static CSV tables | Legacy Russian inflection tables: nouns, adjectives, verbs with all grammatical cases/forms. |
| `chinese-dialect-dictionary.js` | `ChineseDialectDictionary` | `yue`, `hak`, `nan` (Cantonese, Hakka, Min Nan) | CC-Canto, dict-hakka, dict-twblg | Chinese dialect dictionaries with pinyin/jyutping romanization and traditional/simplified indices. |
| `freedict-dictionary.js` | `FreedictDictionary` | ~30+ language pairs | FreeDict.org | Multi-language bilingual dictionaries (L2→L1). Dynamic file selection by ISO 639-3 codes. |
| `wiktionary-csv-dictionary.js` | `WiktionaryCsvDictionary` | ~50+ languages | kaikki.org Wiktionary CSV dumps | The main dictionary for most non-CJK languages. L2 code mappings (e.g., Serbian→Serbo-Croatian), supplemental language fallbacks (e.g., Scots→English). |
| `klingonska-dictionary.js` | `KlingonskaDictionary` | `tlh` (Klingon) | klingonska.org | Klingon dictionary with IPA pronunciation. |

### Dictionary Utilities

| File | Key Exports | Purpose |
|---|---|---|
| `dictionary-utils.js` | `proxy`, `isNumeric`, `isThai`, `isRoman`, `isChinese`, `isJapanese`, `isHangul`, `removeToneNumbers`, `removePunctuation`, `stripAccents`, `addSpacesBetweenCharacters`, `escapeRegExp` | Shared helpers used by all dictionary classes: language detection, text normalization, tone removal, proxy fetching. |
| `frequency-assigner.js` | `FrequencyAssigner` (class) | Assigns Zipf frequency ranks and proficiency levels (1–7) to dictionary entries. Supports 50+ languages with per-language frequency data loaded via IndexedDB. |
| `map-kana.js` | `isKanji`, `isHiragana`, `segmentKanjisAndNonKanjis`, `convertKatakanaToHiragana`, `createRegex` | Japanese kana/kanji segmentation and regex-based reading-to-kanji mapping (for furigana/ruby annotation). |

### Tokenizers (`tokenizers/`)

Each tokenizer extends `BaseTokenizer` and handles word segmentation + lemmatization for a language or family. Selected by `TokenizerFactory` based on L2 code.

| File | Class | Language(s) | Method |
|---|---|---|---|
| `base-tokenizer.js` | `BaseTokenizer` | (base class) | Shared logic: MD5 caching, server-cache fallback via `loadFromServerCache()`. |
| `tokenizer-factory.js` | `TokenizerFactory` | (factory) | Routes L2 → tokenizer class. Maintains preference order and `serverCacheTokenizers` mapping for server-side cache parsing. |
| `jieba-tokenizer.js` | `JiebaTokenizer` | `zho` (Chinese) | Remote: POST `/lemmatize` — jieba segmentation |
| `mecab-tokenizer.js` | `MeCabTokenizer` | `jpn` (Japanese) | Remote: POST `/lemmatize` — MeCab + UniDic |
| `openkoreantext-tokenizer.js` | `OpenKoreanTextTokenizer` | `kor` (Korean) | Remote: POST `/lemmatize` — Open Korean Text |
| `hazm-tokenizer.js` | `HazmTokenizer` | `fas` (Persian) | Remote: POST `/lemmatize` — Hazm |
| `qalsadi-tokenizer.js` | `QalsadiTokenizer` | `ara` (Arabic) | Remote: POST `/lemmatize` — Qalsadi |
| `zeyrek-tokenizer.js` | `ZeyrekTokenizer` | `tur` (Turkish) | Remote: POST `/lemmatize` — Zeyrek |
| `pymorphy2-tokenizer.js` | `Pymorphy2Tokenizer` | `rus` (Russian) | Remote: POST `/lemmatize` — pymorphy2 |
| `pyidaungsu-tokenizer.js` | `PyidaungsuTokenizer` | `mya` (Burmese) | Remote: POST `/lemmatize` — pyidaungsu |
| `spacy-tokenizer.js` | `SpacyTokenizer` | `spa`, ~20 others | Remote: POST `/lemmatize` — spaCy (used for Spanish; avoided for most due to slowness) |
| `simplemma-tokenizer.js` | `SimplemmaTokenizer` | `eng`, `fra`, `deu`, ~40 others | Remote: POST `/lemmatize` — Simplemma (lightweight, preferred over spaCy for most European languages) |
| `lemmatizationlist-tokenizer.js` | `LemmatizationListTokenizer` | `fra`, `deu`, `ita`, ~20 others | Remote: POST `/lemmatize` — Lemmatization lists (fallback for languages where Simplemma lacks coverage) |
| `javascriptlemmatizer-tokenizer.js` | `JavaScriptLemmatizerTokenizer` | `eng` (English, legacy) | Local: JavaScript Lemmatizer (archived in favour of Simplemma) |

### Inflectors (`inflectors/`)

Each inflector extends `BaseInflector` and generates inflected/conjugated forms for a word lemma. Selected by `InflectorFactory` based on L2 code.

| File | Class | Language(s) | Method |
|---|---|---|---|
| `base-inflector.js` | `BaseInflector` | (base class) | Shared logic: inflection caching, server-cache loading. |
| `inflector-factory.js` | `InflectorFactory` | (factory) | Routes L2 → inflector class. Languages without inflection (zh, vi, th, id) skip this entirely. |
| `japanese-inflector.js` | `JapaneseInflector` | `jpn` | Japanese verb/adjective conjugation (te-form, potential, passive, causative, etc.) |
| `korean-inflector.js` | `KoreanInflector` | `kor` | Korean verb conjugation (polite, formal, past, future, etc.) via korean_conjugation |
| `russian-inflector.js` | `RussianInflector` | `rus` | Russian noun/adjective/verb inflection with all cases, genders, numbers |
| `french-inflector.js` | `FrenchInflector` | `fra` | French verb conjugation (all tenses/moods, including subjunctive) |
| `compromise-inflector.js` | `CompromiseInflector` | `eng`, `deu`, `ita`, `spa` | Local: compromise.js — fast, client-side conjugation for English/German/Italian/Spanish |
| `pymorphy-inflector.js` | `PymorphyInflector` | `ukr` (Ukrainian) | Remote: pymorphy2-based inflection |
| `pattern-inflector.js` | `PatternInflector` | `nld` (Dutch) | Remote: Pattern library |

### Archive (`archive/`)

| File | Purpose |
|---|---|
| `ecdict.js` | Legacy ECDICT (English-Chinese) dictionary — replaced by Wiktionary/HskCedict. |
| `wiktionary-json.js` | Legacy Wiktionary JSON format parser — replaced by WiktionaryCsvDictionary. |

---

## Key Patterns

### Word Saving Flow (Star component)

1. `Star.vue` checks `savedWords` Vuex store to determine if word is saved
2. `saveWordClick()` → dispatches `savedWords/ADD_SAVED_WORD` mutation
3. Mutation updates Vuex state + persists to localStorage (`zthSavedWords`)
4. `Star.vue` emits animation event (`$nuxt.$emit('animateStar')`)
5. WordBlock shows saved indicator (definition annotation, level color)

### Dictionary Lookup Flow

1. User clicks a WordBlock in transcript/text → `wordBlockClick()`
2. WordBlock calls `lookupWord()` → Python Flask `/dictionary/lookup` API
3. Results cached in Vue component data
4. `PopupDictionaryModal` opens with `WordBlockPopup` content
5. Popup shows: images, lemmas, pronunciation, matching entries, translation
6. User can save word (Star), see ChatGPT explanation, navigate to full entry

### WordBlock (Interactive Token)

The `WordBlock` component is the most distinctive element of Classic:
- Each token in a transcript/subtitle is a WordBlock
- Shows ruby annotations (reading above characters)
- Color-coded by proficiency level (outside → A1 → C2)
- Click opens PopupDictionaryModal
- Shows quick gloss definition when saved
- Supports quiz mode (hide word, show on tap)

### Dictionary Page (SearchCompare)

- `SearchCompare` component on `/dictionary` page
- Type-ahead search with debounce
- Results show matching entries with head, pronunciation, definitions
- Supports wildcard search (`_` for one char, `*` for multiple)
- Links to external dictionaries
- "Random word" feature

### Video + Transcript Integration

1. `VideoWithTranscript` renders video + synced transcript side-by-side
2. `SyncedTranscript` scrolls to current timestamp
3. Each line is a `TranscriptLine` containing `TokenizedText`
4. `TokenizedText` contains `WordBlock` components for each token
5. Clicking a WordBlock opens `PopupDictionaryModal`
6. Context (sentence, video ID, timestamp) passed for save attribution

### localStorage Persistence

All user data is stored in localStorage:
- `zthSavedWords` — saved words per L2
- `zthProgress` — learning progress per L2
- Settings, history, watch history, etc.

On login, data syncs to Directus `user_data` collection.

### Settings Architecture

> **⚠️ LEGACY — DO NOT EDIT.** This documents how Classic settings work. The Next.js migration target design is in `specs/007-settings-architecture.md`.

#### Settings Shape

**File:** `store/settings.js` — Three categories of settings:

**General settings** (`defaultGeneralSettings`) — persisted to localStorage:

```js
{
  adminMode: false,
  skin: "dark",              // "light" | "dark"
  mode: "subtitles",         // "subtitles" | "transcript"
  autoPause: false,
  speed: 1,                  // 0.5 | 0.75 | 1.0
  karaokeAnimation: true,
  useSmoothScroll: false,
  collapsed: false,
  muteAutoplay: false,
  subsSearchLimit: true,
  preferredCategories: [],
  l2Settings: {},            // ← nested per-language settings (see below)
}
```

**Per-L2 settings** (`defaultL2Settings`) — keyed by L2 code inside `l2Settings`:

```js
{
  l1: "en",
  showPinyin: true,
  showTranslation: true,
  showDefinition: false,
  showQuickGloss: true,
  useTraditional: false,
  showByeonggi: true,
  showPinyinForHigherLevelWordsOnly: false,
  phoneticsOnly: false,
  zoomLevel: 0,              // 0–7 text size scale
  useSerif: false,
  showQuiz: true,
  autoPronounce: true,
  quizMode: false,
  disableAnnotation: false,
  tvShowFilter: null,
  categoryFilter: null,
  corpname: null,
  voice: null,               // preferred TTS voice name
}
```

**Transient settings** (`defaultTransientSettings`) — NOT persisted:

```js
{
  l1: undefined,             // L1 language object (runtime)
  l2: undefined,             // L2 language object (runtime)
  dictionary: undefined,
  dictionaryName: undefined,
  useMachineTranslatedDictionary: false,
  fullscreen: false,
  settingsLoaded: false,
}
```

The Vuex state merges general + transient: `state = { ...defaultGeneralSettings, ...defaultTransientSettings }`.

#### Storage

| Property | Value |
|---|---|
| **Primary store** | Vuex `store/settings.js` |
| **localStorage key** | `zthSettings` |
| **Format** | Single JSON blob — general settings with nested `l2Settings[l2Code]` |
| **Persistence trigger** | Manual — `saveSettingsToStorage()` called inside every mutation |
| **Load trigger** | `LOAD_JSON_FROM_LOCAL` mutation, called from `layouts/default.vue` on language change |
| **Server storage** | Directus `user_data.settings` — same JSON blob, stringified |
| **Conflict resolution** | **Server wins** — `importFromJSON` overwrites localStorage on login |
| **Validation** | Mutations only accept keys present in `defaultGeneralSettings` / `defaultL2Settings` |

**Saved shape on disk:**
```json
{
  "skin": "dark",
  "mode": "subtitles",
  "autoPause": false,
  "speed": 1,
  "karaokeAnimation": true,
  "l2Settings": {
    "zh": { "l1": "en", "showPinyin": true, "showTranslation": true, "zoomLevel": 0 },
    "ja": { "l1": "en", "showPinyin": true }
  }
}
```

**Filtering:** `saveSettingsToStorage()` only persists keys present in `defaultGeneralSettings`. Transient keys (`l1`, `l2`, `dictionary`, etc.) are filtered out. But `l2Settings` IS a key in `defaultGeneralSettings`, so the entire nested per-language object is saved.

Other localStorage keys used elsewhere in the app:

| Key | Store Module |
|---|---|
| `zthSettings` | `store/settings.js` |
| `zthSavedWords` | `store/savedWords.js` |
| `zthProgress` | `store/progress.js` |
| `zthHistory` | `store/history.js` |
| `zthBookshelf` | `store/bookshelf.js` |
| `zthFullHistory` | `store/fullHistory.js` |
| `zthSavedPhrases` | `store/savedPhrases.js` |
| `zthSavedHits` | `store/savedHits.js` |

#### Change Flow

Components use the `settingsMixin` (`lib/mixins/settings-mixin.js`) to read/write settings:

```
Component (v-model="localL2Settings.showPinyin")
  │  @change → updateL2Settings()
  │
  ▼
settingsMixin.updateL2Settings()
  │  $store.dispatch("settings/setL2Settings", localL2Settings)
  │
  ▼
Vuex Action: setL2Settings
  ├─ Commit SET_L2_SETTINGS mutation
  │    ├─ Validate: only keys in defaultL2Settings are accepted
  │    ├─ Vue.set(state.l2Settings, l2Code, l2Settings)
  │    └─ saveSettingsToStorage(state) → localStorage "zthSettings"
  │
  └─ dispatch("syncSettingsToServer")
       └─ PATCH items/user_data/{dataId}
          { settings: JSON.stringify(state) }
          └─ Toast: "Settings saved."
```

Key characteristics:
- **Deep clone** — mixin clones Vuex state into `localSettings` / `localL2Settings` to avoid mutation warnings
- **Dual persistence** — every change writes to both localStorage AND Directus
- **Instant sync** — no debouncing; syncs on every change
- **Validation** — unknown keys are silently dropped by the mutation

#### Sync Flow

**On login (server → local):**
```
1. Plugin directus.js → fetchOrCreateUserData()
2. GET items/user_data?fields=...,settings,...
3. store.dispatch("settings/importFromJSON", settings)
4. SAVE_JSON_FROM_SERVER_TO_LOCAL mutation
   → Overwrites Vuex state AND localStorage with server blob
   → Server wins over any local data
```

**On change (local → server):**
```
1. User changes a setting → mutation → saveSettingsToStorage()
2. Action dispatches syncSettingsToServer()
3. PATCH items/user_data/{dataId} { settings: JSON.stringify(state) }
4. Toast: "Settings saved."
```

**Per-L2 keying:** `state.l2Settings[l2Code]` means a user can have `showPinyin=true` for Chinese but `showPinyin=false` for Japanese. The current L2 code is determined by `$l2.code` from the route.

**CSS integration:** The layout (`layouts/default.vue`) reads settings and adds CSS classes to `<body>`:
```js
"show-translation": this.$l2Settings.showTranslation,
"show-pinyin": this.$l2Settings.showPinyin,
"show-traditional": this.$l2Settings.useTraditional,
```
These classes cascade to show/hide `.translation-line`, `.translated-line`, ruby annotations, etc. — see `QuickSettings/styles.scss`.

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │              localStorage                         │   │
│  │  zthSettings = "{ skin, mode, l2Settings: {...} }"│   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ read/write                              │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │           Vuex Store (settings)                   │   │
│  │  state: { skin, mode, l2Settings: { zh: {...} } } │   │
│  │  mutations: SET_GENERAL_SETTINGS,                 │   │
│  │             SET_L2_SETTINGS,                      │   │
│  │             LOAD_JSON_FROM_LOCAL,                 │   │
│  │             SAVE_JSON_FROM_SERVER_TO_LOCAL        │   │
│  │  actions: setGeneralSettings → commit + sync      │   │
│  │           setL2Settings → commit + sync            │   │
│  │           syncSettingsToServer → PATCH Directus    │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                         │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │             settingsMixin                         │   │
│  │  localSettings ← deepClone(store.settings)        │   │
│  │  localL2Settings ← deepClone(store.l2Settings)    │   │
│  │  updateSettings() → dispatch                       │   │
│  │  updateL2Settings() → dispatch                     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTP PATCH
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Directus 8                             │
│  user_data                                               │
│    id: 123                                               │
│    settings: '{"skin":"dark","l2Settings":{...}}'        │
│    saved_words: '[...]'                                  │
│    progress: '[...]'                                     │
└─────────────────────────────────────────────────────────┘
```

---

## What the Next.js App Should Implement

Based on Classic's architecture, the Next.js app should have:

| Classic Feature | Next.js Route | Status |
|---|---|---|
| Dictionary Search | `/[l1]/[l2]/dictionary` | ✅ Implemented |
| Word Detail Entry | `/[l1]/[l2]/dictionary/word/[id]` | ❌ **Not yet** |
| Saved Words | `/[l1]/[l2]/saved-words` | ✅ Implemented |
| Saved Phrases | `/[l1]/[l2]/saved-phrases` | ❌ Future |
| Media Home (Explore) | `/[l1]/[l2]/explore` | ❌ Future |
| YouTube Section | `/[l1]/[l2]/youtube/*` | ❌ Future |
| TV Shows | `/[l1]/[l2]/tv-shows` | ❌ Future |
| Music / Audiobooks | `/[l1]/[l2]/music` etc. | ❌ Future |
| Text Reader | `/[l1]/[l2]/reader` | ❌ Future |
| Language Progress | `/[l1]/[l2]/progress` | ❌ Future |
| Settings | `/[l1]/[l2]/settings` | ❌ Future |
| Grammar Reference | `/[l1]/[l2]/grammar` | ❌ Future |

### Word Detail Page — Classic Pattern
- Route: `/dictionary/word/[id]` (not nested under L1/L2 in Classic — it's a standalone route)
- Shows: EntryHeader (head, alt, pronunciation, level, Star), EntryCharacters, DefinitionsList, EntryYouTube (examples from videos), EntryExamples (example sentences), EntryDifficulty, EntryRelated, EntryExternal
- Multiple entry sub-components can be composed together
- "Look Up In" links to external dictionaries
