# Mobile App — Feature Port Status

> Porting all Next.js web app screens & features to React Native (Expo SDK 57).
> **Source of truth for reference**: `apps/web/src/app/` (Next.js) and `zerotohero-nuxt/app/` (Classic).
> See `AGENTS.md` → Mobile Porting Rules for mapping conventions.

## Legend

| Icon | Meaning |
|---|---|
| ✅ | Complete — feature-complete, no known gaps |
| 🟡 | Partial — works but has notable gaps or bugs |
| 🔄 | In Progress — actively being worked on |
| ⬜ | Not Started — not yet ported |

---

## 🏠 Root-Level Screens

| Screen | Mobile File | Status | Web Source | Notes |
|---|---|---|---|---|
| Splash / Redirect | `app/index.tsx` | ✅ | — | Auth check → login or tabs |
| Login | `app/login.tsx` | ✅ | `login/page.tsx` | |
| Register | `app/register.tsx` | ✅ | `register/page.tsx` | Name fields, email, password + confirmation, client-side validation |
| Forgot Password | `app/forgot-password.tsx` | ✅ | `forgot-password/page.tsx` | |
| Password Reset | `app/password-reset.tsx` | ✅ | — | Deep-link token → new password. Calls `POST /auth/password/reset` on Directus. |
| Verify Email | `app/verify-email.tsx` | ✅ | — | Deep-link token → email verification. Falls back to showing success. |
| Delete Account | `app/delete-account.tsx` | ✅ | — | Confirmation → `DELETE /users/{id}`. Destructive styling, auto-logout. |
| Select Language | `app/select-language.tsx` | ✅ | `language-select/page.tsx` | Unified L1+L2 selection (replaces two-screen flow). Localized names via `lang.xx` keys, search, popular/all grouping |
| Go Pro — Error | `app/go-pro-error.tsx` | ✅ | `go-pro-error/page.tsx` | |
| Go Pro — Success | `app/go-pro-success.tsx` | ✅ | `go-pro-success/page.tsx` | |

---

## 📺 (Media) Tab

### Routes

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Explore | `(tabs)/(media)/index.tsx` | ✅ | `[l1]/[l2]/explore/page.tsx` | Level filter, pagination, pull-to-refresh. No category/genre tabs like web has |
| Search | `(tabs)/(media)/search.tsx` | ✅ | `[l1]/[l2]/search/page.tsx` | Tag cloud, YouTube URL extraction, text search |
| Watch History | `(tabs)/(media)/watch-history.tsx` | ✅ | `[l1]/[l2]/watch-history/page.tsx` | Date-grouped SectionList, "Clear All" via Directus DELETE |
| TV Shows | `(tabs)/(media)/tv-shows.tsx` | ✅ | `[l1]/[l2]/tv-shows/page.tsx` | Browse + search + sort + locale filter. Show detail at `/tv-shows/[id]` with full episode listing |
| Music | `(tabs)/(media)/music.tsx` | ✅ | `[l1]/[l2]/music/page.tsx` | Basic video grid. |
| Live TV | `(tabs)/(media)/live-tv.tsx` | ✅ | `[l1]/[l2]/live-tv/page.tsx` | Channel list + player + filters. **Missing**: URL-based channel restore (`tvgID` param). Web also lacks favorites/EPG/"now playing" — not mobile-specific gaps |
| Local Media | `(tabs)/(media)/local-media.tsx` | ✅ | `[l1]/[l2]/local-media/page.tsx` | Upload + player works. Audio-only mode renders 🎵 card (no VideoView). Subtitle sync offset missing in both web and mobile |
| Video Player | `(tabs)/(media)/watch/[videoId].tsx` | ✅ | `[l1]/[l2]/watch/[videoId]/page.tsx` | Full split-personality layout: transcript mode (tabs: video/transcript/queue/info) + subtitles mode (single-line overlay). VideoMeta, YouTubeChannelCard, VideoQueueList, SimpleSubsForDebug, watch history, position save/restore, video token cache. Playback features wired: `smoothScroll` (Animated.timing 3s ease-out in transcript, instant in single-line), `karaokeMode` (word-by-word opacity dimming in both modes), `autoPause` (pauses on line complete). **Known**: programmatic play (iOS) not available — users tap iframe directly |
| Channel Detail | `(tabs)/(media)/channel/[channelId].tsx` | ✅ | `[l1]/[l2]/channel/[channelId]/page.tsx` | Channel header, video grid, pagination. At parity with web — channel description/subscribe/stats also missing from web channel page (subscribe lives on watch page via `YouTubeChannelCard` + `ChannelActionsMenu`) |

### Video Components

| Component | File | Status | Notes |
|---|---|---|---|
| YouTube Player | `components/video/YouTubePlayer.tsx` | ✅ | Users tap the YouTube iframe directly to play/pause (programmatic `play` prop was broken on iOS — removed; `seekTo`/`getCurrentTime` work on both platforms) |
| Video Control Bar | `components/video/VideoControlBar.tsx` | ✅ | Play/pause, line nav, speed toggle, progress, queue nav |
| Subtitle Display | `components/video/SimpleSubsForDebug.tsx` | ✅ | Dual-mode: `singleLine` (centered active line + prev/next nav + video queue controls) and full transcript FlatList with Animated.timing auto-scroll. TokenizedText, batch lemmatization, karaoke, translations, highlightTerms |
| Video Card | `components/video/VideoCard.tsx` | ✅ | Thumbnail, title, duration, views, difficulty badge |
| Video Grid | `components/video/VideoGrid.tsx` | ✅ | 2-column FlatList with pagination, pull-to-refresh |
| Level Filter | `components/video/LevelFilter.tsx` | ✅ | CEFR/HSK/JLPT pill filter |
| Live TV Player | `components/video/LiveTVPlayer.tsx` | ✅ | expo-video based, mute toggle, buffering, channel switching |
| Subs Search Results | `components/video/SubsSearchResults.tsx` | ✅ | Word-in-context results with in-line player |
| Subtitle Display | `components/video/SimpleSubsForDebug.tsx` | ✅ | Dual-mode: `singleLine` (centered active line + prev/next nav + video queue controls) and full transcript FlatList with Animated.timing auto-scroll. TokenizedText, batch lemmatization, karaoke, translations |
| Transcript Queue Panel | `components/video/TranscriptQueuePanel.tsx` | ✅ | Transcript / queue / info tab wrapper |
| Video Queue List | `components/video/VideoQueueList.tsx` | ✅ | Queue list with TV show episode headers |
| YouTube Channel Card | `components/video/YouTubeChannelCard.tsx` | ✅ | Channel thumbnail, title, external link, channel page link, channel actions menu |
| Channel Actions Menu | `components/video/ChannelActionsMenu.tsx` | ✅ | Subscribe/unsubscribe/not-interested bottom sheet. Reusable — appears on VideoCard (both layouts) and YouTubeChannelCard |
| Video Meta | `components/video/VideoMeta.tsx` | ✅ | Title, views/likes/comments/date, difficulty badge, locale/category |

---

## 📖 (Reading) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Notes / Reader | `(tabs)/(reading)/index.tsx` | ✅ | `[l1]/[l2]/reader/page.tsx` | Markdown editor, CRUD notes, TokenizedText, auto-save |
| Web Reader | `(tabs)/(reading)/web-reader.tsx` | ✅ | `[l1]/[l2]/web-reader/page.tsx` | URL fetch + tokenization works. TextActionMenu (copy/speak/AI explain/translate) on each paragraph. Notes sidebar with create/select/rename/delete. **Still missing**: page translation. |
| EPUB Reader | `(tabs)/(reading)/epub.tsx` | ✅ | `[l1]/[l2]/epub/page.tsx` | Upload + parse + read works. Position/anchor save. |

### Reader Components

| Component | File | Status | Notes |
|---|---|---|---|
| TokenizedText | `components/TokenizedText.tsx` | ✅ | Core — tappable word tokens, lemmatization, dictionary popup |
| TextActionMenu | `components/TextActionMenu.tsx` | ✅ | Per-block action menu: copy, speak (TTS), AI explain (streaming DeepSeek), translate (POST /translate). Bottom sheet on trigger. |
| TabbedPanel | `components/TabbedPanel.tsx` | ✅ | Reusable tab bar + content switcher |
| EPUB Chapter Sidebar | `components/reader/epub-chapter-sidebar.tsx` | ✅ | Chapter TOC with prev/next nav |
| Book Search Dialog | `components/reader/BookSearchDialog.tsx` | ✅ | In-book search with highlighted snippets; tap a result to jump to the matching page |
| EPUB Cover | `components/reader/EpubCover.tsx` | ✅ | EPUB cover image rendering |
| Paginated Reader | `components/reader/PaginatedReader.tsx` | ✅ | Shared paginated content renderer (EPUB + notes reader) |

---

## 📚 (Vocab) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Dictionary Search | `(tabs)/(vocab)/index.tsx` | ✅ | `[l1]/[l2]/dictionary/page.tsx` | Search + recent searches + results cards |
| Saved Words | `(tabs)/(vocab)/saved-words.tsx` | ✅ | `[l1]/[l2]/saved-words/page.tsx` | Responsively tiled compact `DictionaryEntryCard`s (like the explore grid) with saved-word metadata (date · source · context with the saved form highlighted) and inline save/remove. Filter + export + clear all work; sort toggle removed (always newest-first). Lazily enriches each word's full entry. Seeds the entry-page sidebar with the saved-words list. |
| SRS Review | `(tabs)/(vocab)/review.tsx` | ✅ | `[l1]/[l2]/review/page.tsx` | Full SM-2 algorithm, due card computation, 4 ratings (again/hard/good/easy), undo, daily new card limit, "no cards due" & "all done" states, entry preloading |
| Word Detail | `(tabs)/(vocab)/word/[entryId].tsx` | ✅ | `dictionary/entry/...` | ADR 0007 two-panel: definitions card (classifiers, study materials, han script, phonetic extras, Google Images, match_type, SpeakButton) + tabs panel (examples, inflections, AI explanation) with icons |

### Dictionary Components

| Component | File | Status | Notes |
|---|---|---|---|
| Dictionary Popup | `components/dictionary/DictionaryPopup.tsx` | ✅ | Modal popup with word lookup |
| Dictionary Entry Card | `components/dictionary/DictionaryEntryCard.tsx` | ✅ | Headword, pronunciation, level, definitions |
| Save Button | `components/dictionary/SaveButton.tsx` | ✅ | Bookmark save/unsave toggle |
| Search Bar | `components/dictionary/SearchBar.tsx` | ✅ | With clear + loading spinner |
| Saved Word Entry Card | `components/dictionary/SavedWordEntryCard.tsx` | ✅ | Renders a saved word as a compact `DictionaryEntryCard` from its lazily-enriched entry; loads head+spinner while enriching; normalizes the entry id to the saved word id |
| Word List Sidebar | `components/dictionary/WordListSidebar.tsx` | ✅ | Slide-in sidebar (`@rn-primitives/dialog` DrawerContent) fed by `SidebarSource`; shows the source word list (search results / autocomplete suggestions / corpus related) with prev/next header buttons and current-entry highlight. Toggle only renders when the sidebar is available. |
| Word List | `components/dictionary/WordList.tsx` | ✅ | Reusable FlatList for saved words |
| Lookup Source Indicator | `components/dictionary/LookupSourceIndicator.tsx` | ✅ | Shows which dictionary source provided the entry |
| Inline Definition | `components/dictionary/InlineDefinition.tsx` | ✅ | Inline pronunciation + part-of-speech + first definition from lazily enriched canonicalEntry |
| Saved Word Source | `components/dictionary/SavedWordSource.tsx` | ✅ | Video/article source attribution with icon + title + date |
| Offline Banner | `components/dictionary/OfflineBanner.tsx` | ✅ | Offline availability status banner |
| Dictionary Definitions Panel | `components/dictionary/DictionaryDefinitionsPanel.tsx` | ✅ | Full definitions panel (classifiers, study materials, han script, phonetic extras, Google Images, match_type, SpeakButton, SaveButton). Ported from web. |
| Speak Button | `components/dictionary/SpeakButton.tsx` | ✅ | TTS button using expo-speech via useSpeech hook |
| Image Search | `components/dictionary/ImageSearchResults.tsx` | ✅ | Openverse image search: grid variant (Images tab in DictionaryEntryTabs) with LLM-rewritten query pills, paginated 3-col grid, query relaxation, skeleton loading; compact variant (thumbnail strip) in DictionaryPopup. Same Openverse + `/dictionary/image-queries` endpoints as web. |
| Corpus Panel | `components/dictionary/corpus/corpus-panel.tsx` | ✅ | Corpus tab (Sketch Engine, SPEC-047): Collocations / Examples / Related / Mistakes pills (Mistakes zh-only). Sections use TokenizedText with term highlighting + L1 translations; Related words render as compact entry cards seeding the sidebar (source 'corpus'). `use-corpus-fetch.ts` + `use-corpus-translations.ts` shared. |

---

## 👤 (Me) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Profile / Me | `(tabs)/(me)/index.tsx` | ✅ | — | Menu list with semantic NativeWind design tokens |
| Profile Detail | `(tabs)/(me)/profile.tsx` | ✅ | `[l1]/[l2]/profile/page.tsx` | Info + watch history + saved words previews. Includes subscription management (pro status, cancel auto-renew, expire dates, lifetime upsell) and language level selector |
| Go Pro | `(tabs)/(me)/go-pro.tsx` | ✅ | `[l1]/[l2]/go-pro/page.tsx` | Plan selection, Stripe credit card checkout, WeChat Pay, Alipay, PayPal (lifetime). **IAP not ported** — see [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 5. |
| Settings | `(tabs)/(me)/settings/` | ✅ | `[l1]/[l2]/settings/page.tsx` | List→detail navigation with search (Display/Playback/Speech/Review + Offline Dictionaries). Full parity with web: theme, translation preview, popup dictionary, font/text size, phonetics, word-level display, Chinese/Korean/Vietnamese options, quiz mode, captions/karaoke/auto-pause, voice picker, new cards/day. iPad split view. Settings saved confirmation badge. Native stack header respects light/dark theme. See [SPEC-015](../../docs/specs/015-mobile-settings-completion.md). |
| About | `(tabs)/(me)/about.tsx` | ✅ | ✅ | Basic app info |
| Docs / Help | `(tabs)/(me)/docs.tsx` | ✅ | `[l1]/[l2]/docs/` | Searchable doc listing. MarkdownText rendering (headings, lists, bold/italic, code, links) + "On this page" heading TOC sidebar |
| Tokenizer Debug | `(tabs)/(me)/tokenizer.tsx` | ✅ | `[l1]/[l2]/tokenizer/page.tsx` | Dev tool |
| Offline Dictionaries | `(tabs)/(me)/offline-dictionaries.tsx` | ✅ | — | Manage downloaded offline dictionaries |

### Settings Sub-Components

| Component | File | Status | Notes |
|---|---|---|---|
| Search Bar | `(tabs)/(me)/settings/_components/SearchBar.tsx` | ✅ | Settings search/filter |
| Section Header | `(tabs)/(me)/settings/_components/SectionHeader.tsx` | ✅ | Grouped settings section title |
| Segmented Row | `(tabs)/(me)/settings/_components/SegmentedRow.tsx` | ✅ | Multi-option segmented control row |
| Slider Row | `(tabs)/(me)/settings/_components/SliderRow.tsx` | ✅ | Slider input row |
| Toggle Row | `(tabs)/(me)/settings/_components/ToggleRow.tsx` | ✅ | Switch toggle row |

### Layout Components

| Component | File | Status | Notes |
|---|---|---|---|
| Header | `components/layout/Header.tsx` | ✅ | Logo, search, language switcher, user menu, drawer |
| Hamburger Drawer | `components/layout/HamburgerDrawer.tsx` | ✅ | NAV_GROUPS slide-in drawer (uses `Dialog.Overlay` + `Dialog.DrawerContent`) |
| Language Switcher | `components/layout/LanguageSwitcher.tsx` | ✅ | L1/L2 dropdown with search + locale name resolution |
| User Menu | `components/layout/UserMenu.tsx` | ✅ | Avatar → dropdown |

---

## 🧩 Shared Components

| Component | File | Status | Notes |
|---|---|---|---|
| TokenizedText | `components/TokenizedText.tsx` | ✅ | Core lemmatized text rendering across all screens |
| TabbedPanel | `components/TabbedPanel.tsx` | ✅ | Used by WordDetailScreen and Settings |
| AI Explanation | `components/AiExplanation.tsx` | ✅ | DeepSeek SSE streaming |
| Markdown Explanation | `components/dictionary/MarkdownExplanation.tsx` | ✅ | AI explanation renderer — backticked L2 spans become interactive TokenizedText once streaming finishes |
| PitchAccent | `components/PitchAccent.tsx` | ✅ | Japanese kana with ↑↓ pitch accent markers via `@langplayer/utils` |
| Inflection Table | `components/InflectionTable.tsx` | ✅ | Multi-language inflection support |
| MarkdownText | `components/MarkdownText.tsx` | ✅ | Basic markdown rendering |
| VoicePicker | `components/VoicePicker.tsx` | ✅ | TTS voice selector with rate control |
| Language Picker | `components/LanguagePicker.tsx` | ✅ | Language selection (L1/L2) |
| Language Picker Narrow | `components/LanguagePickerNarrow.tsx` | ✅ | Narrow layout variant |
| Language Picker Wide | `components/LanguagePickerWide.tsx` | ✅ | Wide layout variant |

### UI Primitives

| Component | File | Status | Notes |
|---|---|---|---|
| Dialog | `components/ui/dialog.tsx` | ✅ | Modal dialog primitive (wraps `@rn-primitives/dialog`) |
| Portal | `app/_layout.tsx` | ✅ | Portal host for overlays (wraps `@rn-primitives/portal`) |
| Select | `components/ui/select.tsx` | ✅ | Select/dropdown primitive (wraps `@rn-primitives/select`) |
| Switch | `components/ui/switch.tsx` | ✅ | Toggle switch primitive (wraps `@rn-primitives/switch`) |
| Tabs | `components/ui/tabs.tsx` | ✅ | Tab bar primitive (wraps `@rn-primitives/tabs`) |

---

## 🪝 Hooks

| Hook | File | Status | Notes |
|---|---|---|---|
| `useT()` / i18n | `hooks/use-t.ts` | ✅ | react-intl with ICU, dot-path resolution |
| Settings | `hooks/use-settings.ts` | ✅ | SecureStore + cloud sync, `updateDisplay/Playback/TokenizedText/Review/L2` |
| Saved Words | `hooks/use-saved-words.ts` | ✅ | CRUD per L2, SecureStore + cloud, auto-enrichment |
| SRS | `hooks/use-srs.ts` | ✅ | Card store with SecureStore + cloud. Full SM-2 scheduling wired into ReviewScreen (due card computation, 4 ratings, undo, daily new limit) |
| Progress | `hooks/use-progress.ts` | ✅ | Per-L2 level + time tracking |
| EPUB | `hooks/use-epub.ts` | ✅ | Full JSZip/OPF/NCX parsing |
| Reader Notes | `hooks/use-reader-notes.ts` | ✅ | CRUD via API |
| Speech / TTS | `hooks/use-speech.ts` | ✅ | expo-speech + settings |
| Subtitle Translation | `hooks/use-subtitle-translation.ts` | ✅ | Chunked /translate_array calls |
| Video Token Cache | `hooks/use-video-token-cache.ts` | ✅ | Pre-fetches lemmatized video tokens using Directus video ID |
| Watch History | `hooks/use-watch-history-recorder.ts` | ✅ | Saves position to Python backend every 15s |
| Difficulty Profile | `hooks/use-difficulty-profile.ts` | ✅ | Module-level cached fetch for difficulty profiles |
| Local Media | `hooks/use-local-media.ts` | ✅ | File picker, subtitle parsing, position auto-save |
| Inflected Search Terms | `hooks/use-inflected-search-terms.ts` | ✅ | Head + alternate forms for subs search |
| Active Line Index | `hooks/use-active-line-index.ts` | ✅ | Current active subtitle line tracking |
| EPUB Pagination | `hooks/use-epub-pagination.ts` | ✅ | Paginated EPUB content rendering |
| Progress Level | `hooks/use-progress-level.ts` | ✅ | Per-L2 proficiency level tracking |
| Transcript Auto-Scroll | `hooks/use-transcript-auto-scroll.ts` | ✅ | Auto-scroll transcript to active line |

---

## 🧩 Contexts

| Context | File | Status | Notes |
|---|---|---|---|
| Auth | `contexts/AuthContext.tsx` | ✅ | Directus auth, SecureStore tokens |
| Language | `contexts/LanguageContext.tsx` | ✅ | L1/L2 state + language meta |
| Intl Provider | `contexts/IntlProvider.tsx` | ✅ | react-intl with 31 locales |
| Settings | `contexts/SettingsContext.tsx` | ✅ | Wraps useSettings hook |
| Dictionary | `contexts/DictionaryContext.tsx` | ✅ | Search state + recent searches |
| User Data | `contexts/UserDataContext.tsx` | ✅ | Fetches user data on auth |
| Theme | `contexts/ThemeContext.tsx` | ✅ | Syncs theme to NativeWind |
| Video Player | `contexts/VideoPlayerContext.tsx` | ✅ | Queue manager for playlist |

---

## ⚠️ Critical Issues / Blockers

| # | Issue | Severity | Affects |
|---|---|---|---|
| 1 | **YouTube programmatic play broken on iOS** — `react-native-youtube-iframe` `play` prop doesn't start playback on iOS. **Mitigated**: `play` prop removed; users tap the iframe directly to play/pause. `seekTo`, `getCurrentTime`, and `setPlaybackRate` work on both platforms. | ✅ Fixed | Video Player |
| 2 | — | — | — |

---

## � Phased Implementation Plan

> **Priority key:** 🔴 High (revenue/blocker) · 🟠 Medium (UX gap) · 🔵 Low (nice-to-have) · ⚪ Polish (auth)

### Phase 1: Monetization 🔴

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 1.1 | Subscription State (Context) | `use-subscription.ts` | S | None | Unified subscription state across web & mobile. Requires `SubscriptionContext` in `apps/mobile/contexts/`. Fetches `/user-subscription`, exposes `isPro`/`planType`/`willAutoRenew`/`cancelSubscription()`. See [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 4. |
| 1.2 | In-App Purchase (IAP) | — | L | 1.1 (needs context for feature gating) | Apple App Store / Google Play Store. **Nuxt classic had it** (`@ionic-native/in-app-purchase-2` + Capacitor). **GO legacy had it but removed** (`react-native-iap` removed for SDK 57 compatibility). **Python backend validates Apple receipts** (`app_in_app_purchase.py` via `inapppy.AppStoreValidator`). See [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 5. |
| 1.3 | Sale Pricing | — | M | 1.1 | Show sale banner + discounted prices when `type: 'sale'` prices are active in `prices.csv`. Sale detection logic from Classic app. See [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 9. |

**Goal:** App Store submission readiness. IAP is a hard requirement for iOS App Store; SubscriptionContext is a prerequisite for both IAP and sale pricing.

---

### Phase 2: Saved Words UX 🟠 ✅

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 2.1 | Inline Word Definitions | `inline-definition.tsx` | M | None | ✅ `InlineDefinition` renders pronunciation + part-of-speech + first definition from lazily enriched `canonicalEntry`. No popup needed — the #1 UX gap for daily vocab review is closed. |
| 2.2 | Saved Word Source | `saved-word-source.tsx` | S | None | ✅ `SavedWordSource` shows video/article source context with icon + title + date. Matches web's `SavedWordSource` component. |

**Result:** Saved-words browsing is now at parity with web. Inline definitions appear automatically as rows scroll into view (existing lazy enrichment mechanism), and source attribution shows where each word was saved from.

---

### Phase 3: Reader Experience 🟠 ✅

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 3.1 | Text Action Menu | `text-action-menu.tsx` | M | None | ✅ `TextActionMenu` wraps each paragraph/blockquote/list-item with a ⋮ button. Bottom sheet with Copy (expo-clipboard), Speak (TTS), AI Explain (streaming DeepSeek via `useStreamingExplanation`), Translate (POST `/translate`). Matches web's 4 actions. |
| 3.2 | Notes Sidebar (Web Reader) | `notes-sidebar.tsx` | M | None | ✅ `useReaderNotes` integrated into web-reader screen. Notes sidebar with create/select (tap)/rename (long-press)/delete matches the notes reader (`index.tsx`) pattern. |

**Result:** Web reader now has per-block text actions and full notes management, matching the notes reader's sidebar UX.

---

### Phase 4: Content Discovery 🟠 ✅

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 4.1 | Channel Subscribe/Actions | `channel-actions-menu.tsx` + `use-channel-preference.ts` | M | `use-channel-preference` hook | ✅ `useChannelPreference` hook mirrors web's shared-cache pattern (deduplicates N concurrent fetches). `ChannelActionsMenu` bottom sheet with subscribe/unsubscribe/not-interested options. Integrated into `YouTubeChannelCard` and `VideoCard` (both card + list layouts). |

**Goal:** ✅ Channel preferences influence content recommendations and let users curate their feed.

---

### Phase 5: CJK Language Support 🔵 ✅

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 5.1 | Script Preference | `use-script-preference.ts` | S | None | ✅ `useScriptPreference` hook ported to mobile (reads `getL2().display.traditional` from SettingsContext). Integrated into `DictionaryEntryCard` — shows alternate script (traditional↔simplified Chinese, chữ Hán for VI, hanja for KO) next to headword. |
| 5.2 | Pitch Accent Display | `pitch-accent.tsx` | S | None | ✅ `PitchAccent` component renders kana with ↑↓ markers using `@langplayer/utils` (`splitIntoMoras` + `applyPitchAccent`). Shown in `DictionaryEntryCard` for Japanese entries with `phonetic_detail.pitch_accent` data. |

**Goal:** ✅ Chinese/VI/KO entries show alternate script; Japanese entries show pitch accent markings. Both read from existing `DictionaryEntry` fields — no new data fetching needed. |

---

### Phase 6: Infrastructure & Polish 🔵

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 6.1 | Interaction Primitives (@rn-primitives) | — | L | None (incremental adoption) | ✅ Dialog, Select, Switch, Tabs, Portal, Drawer all wrapped in `components/ui/` with NativeWind + shared design tokens. `HamburgerDrawer` now uses `Dialog.Overlay` + `Dialog.DrawerContent` (slide-from-right). Mirrors web's `@base-ui/react` adoption. See [ADR-0014](../../docs/adr/0014-rn-primitives-interaction-primitives.md). |
| 6.2 | Local Tokenizer | — | XL | Offline dictionary downloads (SPEC-013) | ✅ Phase 1 (regex split, arabic-stem, server-first pipeline), ✅ Phase 2a (snowball stemmers, lemma tables), ✅ Phase 2b (dict-based CJK/SEA segmentation), ✅ Phase 2c (kuromoji Japanese — full morphological analysis with RN filesystem loader). ⬜ Phase 2d (kuromoji-ko Korean). See [SPEC-018](../../docs/specs/018-local-tokenization-mobile.md). |
| 6.3 | Dictionary Entry Detail (full page) | `dictionary/entry/[dictionaryId]/[entryId]/page.tsx` | M | None | ✅ Full parity with web's `DictionaryDefinitionsPanel` — classifiers (measure words/gender/noun class), study material coverage (textbook appearances), han script detail (simplified/traditional), phonetic detail extras, Google Images link, match_type badge, tab icons (Film/Binary/Sparkles). Adopts ADR 0007 two-panel layout: definitions card + tabs panel (no more "Definitions" tab). New `SpeakButton` (expo-speech TTS), `DictionaryDefinitionsPanel` component. |

**Goal:** Architecture improvements and deep linking support. Local tokenizer is the largest remaining feature — enables fully offline reading.

---

### Phase 7: Auth Completion ⚪ ✅

| # | Feature | File | Status | Notes |
|---|---|---|---|---|
| 7.1 | Password Reset (token) | `app/password-reset.tsx` | ✅ | Deep-link token from email → new password + confirm → calls `POST /auth/password/reset` on Directus. Success state with back-to-login. Uses `title.reset_password`, `placeholder.password`, `placeholder.confirm_password`, `msg.reset_password_success`, `error.passwords_do_not_match`. |
| 7.2 | Verify Email | `app/verify-email.tsx` | ✅ | Deep-link token → calls `POST /auth/verify-email` on Directus. Falls back to showing success (user deliberately clicked link). Uses `title.email_verified`, `msg.email_verified`, `action.back_to_login`. |
| 7.3 | Delete Account | `app/delete-account.tsx` | ✅ | Confirmation card with warning → `DELETE /users/{id}` on Directus. Destructive styling, cancel/back, success state with auto-logout. Linked from Me screen (`Trash2` icon, `text-destructive` label). Uses `title.delete_account`, `msg.delete_account_confirm`, `msg.account_deleted`, `action.confirm_deletion`, `action.cancel`. |

**New translation keys added:** `msg.reset_password_success`, `title.email_verified`, `msg.email_verified`, `msg.delete_account_confirm`, `msg.account_deleted`.

---

### Phase 8: iPad & Responsive Layout ✅

| # | Feature | Web Source | Effort | Dependencies | Notes |
|---|---|---|---|---|---|
| 8.1 | Unlock Landscape Orientation | — | S | None | ✅ `app.json`: `"orientation": "portrait"` → `"default"`. iPhone keeps portrait default; iPad allows all 4 orientations. Video player already handles landscape. |
| 8.2 | Responsive Video Grid Columns | `explore/page.tsx` | S | None | ✅ `VideoGrid` uses `useWindowDimensions` — <400px→1col, <700px→2col, <1000px→3col, ≥1000px→4col. `FlatList key` changes with column count to force re-render. |
| 8.3 | Settings Sidebar Width Cap | `settings/index.tsx` | S | None | ✅ Sidebar capped at `Min(256, width * 0.4)`. Falls back to narrow mode when detail pane <320px. Uses `style={{ width }}` instead of `w-64`. |
| 8.4 | Drawer Width Cap | `HamburgerDrawer.tsx` | S | None | ✅ Drawer capped at `Min(256, screenWidth * 0.6)`. `DrawerContent` accepts new `drawerWidth` prop; removed hardcoded `w-64` from `dialog.tsx`. |
| 8.5 | Wide-Screen Content Max-Width | Explore, Search, etc. | M | None | ✅ Created `<PageContainer>` component in `components/layout/`. Provides `bg-background` outer wrapper + `max-w-3xl self-center` inner content area. Applied to all 15 list/content screens (explore, search, music, watch-history, tv-shows, live-tv, channel-detail, saved-words, dictionary, review, notes-reader, web-reader, docs, profile, go-pro). ScrollView-based screens use `<ScrollView className="flex-1">` as a direct child — PageContainer handles the width constraint. Screens intentionally excluded: watch, EPUB, local-media, settings detail, tokenizer. |

**Goal:** ✅ App looks polished at every iPad window size — 1/3 split view (~320px), 50/50 split (~438px), full-screen portrait (820px), full-screen landscape (1180px), and Slide Over (~320px). See [SPEC-020](../../docs/specs/020-ipad-responsive-layout.md).

---

### Effort Legend

| Label | Meaning |
|---|---|
| S | Small — ~1–2 days |
| M | Medium — ~3–5 days |
| L | Large — ~1–2 weeks |
| XL | Extra Large — multi-sprint |

