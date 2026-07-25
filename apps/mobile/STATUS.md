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
| Select L1 | `app/select-l1.tsx` | ✅ | `language-select/page.tsx` | Localized names via `lang.xx` keys, search, popular/all grouping |
| Select L2 | `app/select-l2.tsx` | ✅ | `language-select/page.tsx` | Localized names via `lang.xx` keys, search, popular/all grouping |
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
| Live TV | `(tabs)/(media)/live-tv.tsx` | 🟡 | `[l1]/[l2]/live-tv/page.tsx` | Channel list + player + filters. **Missing**: URL-based channel restore (`tvgID` param). Web also lacks favorites/EPG/"now playing" — not mobile-specific gaps |
| Local Media | `(tabs)/(media)/local-media.tsx` | 🟡 | `[l1]/[l2]/local-media/page.tsx` | Upload + player works. **Missing**: audio-only mode (web `HTML5Player` adapts when `isAudio=true`; mobile always renders `VideoView`). Subtitle sync offset also missing in web — not a mobile gap |
| Video Player | `(tabs)/(media)/watch/[videoId].tsx` | 🟡 | `[l1]/[l2]/watch/[videoId]/page.tsx` | **⚠️ YouTube playback broken on iOS**. **Missing**: transcript/queue/info tabs (`TranscriptQueuePanel`), overlay subtitles mode (`SubtitlesModeBand`), video queue (`VideoQueueList`), channel card (`YouTubeChannelCard`), video meta (difficulty/description), watch history recording, position save/restore, token cache |
| Channel Detail | `(tabs)/(media)/channel/[channelId].tsx` | ✅ | `[l1]/[l2]/channel/[channelId]/page.tsx` | Channel header, video grid, pagination. At parity with web — channel description/subscribe/stats also missing from web channel page (subscribe lives on watch page via `YouTubeChannelCard` + `ChannelActionsMenu`) |

### Video Components

| Component | File | Status | Notes |
|---|---|---|---|
| YouTube Player | `components/video/YouTubePlayer.tsx` | 🟡 | **⚠️ Broken on iOS** — declarative `play` prop doesn't work |
| Video Control Bar | `components/video/VideoControlBar.tsx` | ✅ | Play/pause, line nav, speed toggle, progress, queue nav |
| Subtitle Display | `components/video/SubtitleDisplay.tsx` | ✅ | Dual-line L2 + L1, active highlighting, auto-scroll, TokenizedText |
| Video Card | `components/video/VideoCard.tsx` | ✅ | Thumbnail, title, duration, views, difficulty badge |
| Video Grid | `components/video/VideoGrid.tsx` | ✅ | 2-column FlatList with pagination, pull-to-refresh |
| Level Filter | `components/video/LevelFilter.tsx` | ✅ | CEFR/HSK/JLPT pill filter |
| Live TV Player | `components/video/LiveTVPlayer.tsx` | ✅ | expo-video based, mute toggle, buffering, channel switching |
| Subs Search Results | `components/video/SubsSearchResults.tsx` | ✅ | Word-in-context results with in-line player |

---

## 📖 (Reading) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Notes / Reader | `(tabs)/(reading)/index.tsx` | ✅ | `[l1]/[l2]/reader/page.tsx` | Markdown editor, CRUD notes, TokenizedText, auto-save |
| Web Reader | `(tabs)/(reading)/web-reader.tsx` | 🟡 | `[l1]/[l2]/web-reader/page.tsx` | URL fetch + tokenization works. **Missing**: notes sidebar (`ReaderSidebar`), page translation. Web also lacks bookmarking/offline reading/font customization — not mobile-specific gaps |
| EPUB Reader | `(tabs)/(reading)/epub.tsx` | 🟡 | `[l1]/[l2]/epub/page.tsx` | Upload + parse + read works. **Missing**: page translation, position/anchor save. Web also lacks font customization/bookmarks/search/reading progress — not mobile-specific gaps |

### Reader Components

| Component | File | Status | Notes |
|---|---|---|---|
| TokenizedText | `components/TokenizedText.tsx` | ✅ | Core — tappable word tokens, lemmatization, dictionary popup |
| TabbedPanel | `components/TabbedPanel.tsx` | ✅ | Reusable tab bar + content switcher |
| EPUB Chapter Sidebar | `components/reader/epub-chapter-sidebar.tsx` | ✅ | Chapter TOC with prev/next nav |

---

## 📚 (Vocab) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Dictionary Search | `(tabs)/(vocab)/index.tsx` | ✅ | `[l1]/[l2]/dictionary/page.tsx` | Search + recent searches + results cards |
| Saved Words | `(tabs)/(vocab)/saved-words.tsx` | 🟡 | `[l1]/[l2]/saved-words/page.tsx` | Filter + sort + remove works. **Missing**: export (UI button only, no logic), SRS status dots on word rows, word list navigation context |
| SRS Review | `(tabs)/(vocab)/review.tsx` | 🟡 | `[l1]/[l2]/review/page.tsx` | Flashcard UI works. **⚠️ No actual SRS scheduling** — no SM-2 algorithm, no due card computation, only 2 ratings (again/good) vs web's 4 (again/hard/good/easy), no undo, no daily new card limit, no "no cards due" state |
| Word Detail | `(tabs)/(vocab)/word/[entryId].tsx` | ✅ | `dictionary/entry/...` | Definitions, examples, inflections, AI explanation |

### Dictionary Components

| Component | File | Status | Notes |
|---|---|---|---|
| Dictionary Popup | `components/dictionary/DictionaryPopup.tsx` | ✅ | Modal popup with word lookup |
| Dictionary Entry Card | `components/dictionary/DictionaryEntryCard.tsx` | ✅ | Headword, pronunciation, level, definitions |
| Save Button | `components/dictionary/SaveButton.tsx` | ✅ | Bookmark save/unsave toggle |
| Search Bar | `components/dictionary/SearchBar.tsx` | ✅ | With clear + loading spinner |
| Word List | `components/dictionary/WordList.tsx` | ✅ | Reusable FlatList for saved words |

---

## 👤 (Me) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Profile / Me | `(tabs)/(me)/index.tsx` | 🟡 | — | Menu list. **⚠️ Uses hardcoded hex colors** — violates semantic design tokens rule |
| Profile Detail | `(tabs)/(me)/profile.tsx` | 🟡 | `[l1]/[l2]/profile/page.tsx` | Info + previews. **⚠️ Uses hardcoded hex colors throughout**. **Missing**: subscription management (pro status, cancel auto-renew, expire dates, lifetime upsell), language level selector |
| Settings | `(tabs)/(me)/settings.tsx` | 🟡 | `[l1]/[l2]/settings/page.tsx` | 4 tabs (Display/Playback/Speech/Review). Speech tab uses hardcoded language map instead of locale JSON |
| About | `(tabs)/(me)/about.tsx` | ✅ | — | Basic app info |
| Docs / Help | `(tabs)/(me)/docs.tsx` | 🟡 | `[l1]/[l2]/docs/` | Searchable doc listing. **Missing**: proper markdown rendering in detail view (web uses ReactMarkdown + GFM + heading anchors; mobile strips to plain text), "On this page" heading TOC sidebar |
| Go Pro | `(tabs)/(me)/go-pro.tsx` | 🟡 | `[l1]/[l2]/go-pro/page.tsx` | Shows pricing. **⚠️ No payment flow** — no Stripe credit card checkout, no WeChat Pay, no Alipay, no PayPal, no plan selection interaction, no checkout session creation |
| Tokenizer Debug | `(tabs)/(me)/tokenizer.tsx` | ✅ | `[l1]/[l2]/tokenizer/page.tsx` | Dev tool |

### Layout Components

| Component | File | Status | Notes |
|---|---|---|---|
| Header | `components/layout/Header.tsx` | ✅ | Logo, search, language switcher, user menu, drawer |
| Hamburger Drawer | `components/layout/HamburgerDrawer.tsx` | ✅ | NAV_GROUPS slide-in drawer |
| Language Switcher | `components/layout/LanguageSwitcher.tsx` | ✅ | L1/L2 dropdown with search + locale name resolution |
| User Menu | `components/layout/UserMenu.tsx` | ✅ | Avatar → dropdown |

---

## 🧩 Shared Components

| Component | File | Status | Notes |
|---|---|---|---|
| TokenizedText | `components/TokenizedText.tsx` | ✅ | Core lemmatized text rendering across all screens |
| TabbedPanel | `components/TabbedPanel.tsx` | ✅ | Used by WordDetailScreen and Settings |
| AI Explanation | `components/AiExplanation.tsx` | ✅ | DeepSeek SSE streaming |
| Inflection Table | `components/InflectionTable.tsx` | ✅ | Multi-language inflection support |
| MarkdownText | `components/MarkdownText.tsx` | ✅ | Basic markdown rendering |
| VoicePicker | `components/VoicePicker.tsx` | ✅ | TTS voice selector with rate control |

---

## 🪝 Hooks

| Hook | File | Status | Notes |
|---|---|---|---|
| `useT()` / i18n | `hooks/use-t.ts` | ✅ | react-intl with ICU, dot-path resolution |
| Settings | `hooks/use-settings.ts` | ✅ | SecureStore + cloud sync, `updateDisplay/Playback/TokenizedText/Review/L2` |
| Saved Words | `hooks/use-saved-words.ts` | ✅ | CRUD per L2, SecureStore + cloud, auto-enrichment |
| SRS | `hooks/use-srs.ts` | ✅ | Card store with SecureStore + cloud. **⚠️ Not wired into ReviewScreen** |
| Progress | `hooks/use-progress.ts` | ✅ | Per-L2 level + time tracking |
| EPUB | `hooks/use-epub.ts` | ✅ | Full JSZip/OPF/NCX parsing |
| Reader Notes | `hooks/use-reader-notes.ts` | ✅ | CRUD via API |
| Speech / TTS | `hooks/use-speech.ts` | ✅ | expo-speech + settings |
| Subtitle Translation | `hooks/use-subtitle-translation.ts` | ✅ | Chunked /translate_array calls |
| Video Token Cache | `hooks/use-video-token-cache.ts` | ✅ | Pre-fetches lemmatized video tokens |
| Local Media | `hooks/use-local-media.ts` | ✅ | File picker, subtitle parsing, position auto-save |
| Inflected Search Terms | `hooks/use-inflected-search-terms.ts` | ✅ | Head + alternate forms for subs search |

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
| 1 | **YouTube playback broken on iOS** — declarative `play` prop in `react-native-youtube-iframe` doesn't start playback; fragile key-remount bridge workaround | 🔴 High | Video Player |
| 2 | **ReviewScreen doesn't use SRS scheduling** — `useSrs().updateCard` exists but never called; cards always show in order with no spaced repetition algorithm | 🔴 High | Review |
| 3 | **Go Pro has no payment flow** — pricing displayed but no Stripe/PayPal purchase integration | 🔴 High | Go Pro |
| 4 | **Hardcoded hex colors** in `profile.tsx` and `me/index.tsx` — violates AGENTS.md semantic design tokens rule | 🟡 Medium | Me tab |
| 5 | **Export button in SavedWords is UI-only** — no actual export logic | 🟡 Medium | Saved Words |
| 6 | ~~**Select L1/L2 screens show raw codes**~~ ✅ Fixed | 🟡 Medium | Auth flow |
| 7 | ~~**No "Forgot password?" link on login screen**~~ ✅ Fixed | 🟢 Low | Login |
| 8 | ~~**TV Shows has no episode listing or show detail screen**~~ ✅ Fixed | 🟢 Low | Media tab |

---

## 📋 Features Not Yet Ported at All

These exist in the Next.js web app but have **no mobile equivalent yet**:

| Feature | Web Route | Priority | Notes |
|---|---|---|---|
| TV Show Detail | `tv-shows/[id]/` | ~~Medium~~ ✅ Ported | Episode list, metadata, seasons |
| Dictionary Entry Detail | `dictionary/entry/.../` | Low | Deep link target — word detail exists but full entry page missing |
| Password Reset (token) | `/password-reset` | Low | Complete after email link click |
| Verify Email | `/verify-email` | Low | Email verification landing |
| Delete Account | `/delete-account` | Low | |
| API routes | `api/` | N/A | Not applicable to mobile — uses Python backend directly |

---

## Current Focus

- 🔄 **Phase 7**: Mobile Integration — resolving critical issues (YouTube iOS, SRS scheduling, Go Pro payment)
- Up next: finish remaining Partial screens, then full feature parity audit against Classic
