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
| Video Player | `(tabs)/(media)/watch/[videoId].tsx` | ✅ | `[l1]/[l2]/watch/[videoId]/page.tsx` | Full split-personality layout: transcript mode (tabs: transcript/queue/info) + subtitles mode (overlay band). VideoMeta, YouTubeChannelCard, VideoQueueList, SubtitlesModeBand, watch history, position save/restore, video token cache. Playback features wired: `smoothScroll` (animated spring + 2s throttle), `karaokeMode` (word-by-word opacity dimming in both transcript and overlay), `autoPause` (pauses on line complete). **Known**: programmatic play (iOS) not available — users tap iframe directly |
| Channel Detail | `(tabs)/(media)/channel/[channelId].tsx` | ✅ | `[l1]/[l2]/channel/[channelId]/page.tsx` | Channel header, video grid, pagination. At parity with web — channel description/subscribe/stats also missing from web channel page (subscribe lives on watch page via `YouTubeChannelCard` + `ChannelActionsMenu`) |

### Video Components

| Component | File | Status | Notes |
|---|---|---|---|
| YouTube Player | `components/video/YouTubePlayer.tsx` | ✅ | Users tap the YouTube iframe directly to play/pause (programmatic `play` prop was broken on iOS — removed; `seekTo`/`getCurrentTime` work on both platforms) |
| Video Control Bar | `components/video/VideoControlBar.tsx` | ✅ | Play/pause, line nav, speed toggle, progress, queue nav |
| Subtitle Display | `components/video/SubtitleDisplay.tsx` | ✅ | Dual-line L2 + L1, active highlighting, auto-scroll, TokenizedText |
| Video Card | `components/video/VideoCard.tsx` | ✅ | Thumbnail, title, duration, views, difficulty badge |
| Video Grid | `components/video/VideoGrid.tsx` | ✅ | 2-column FlatList with pagination, pull-to-refresh |
| Level Filter | `components/video/LevelFilter.tsx` | ✅ | CEFR/HSK/JLPT pill filter |
| Live TV Player | `components/video/LiveTVPlayer.tsx` | ✅ | expo-video based, mute toggle, buffering, channel switching |
| Subs Search Results | `components/video/SubsSearchResults.tsx` | ✅ | Word-in-context results with in-line player |
| Subtitles Mode Band | `components/video/SubtitlesModeBand.tsx` | ✅ | Overlay/non-overlay band with line nav, TokenizedText, overlay on wide screens |
| Transcript Queue Panel | `components/video/TranscriptQueuePanel.tsx` | ✅ | Transcript / queue / info tab wrapper |
| Video Queue List | `components/video/VideoQueueList.tsx` | ✅ | Queue list with TV show episode headers |
| YouTube Channel Card | `components/video/YouTubeChannelCard.tsx` | ✅ | Channel thumbnail, title, external link, channel page link |
| Video Meta | `components/video/VideoMeta.tsx` | ✅ | Title, views/likes/comments/date, difficulty badge, locale/category |

---

## 📖 (Reading) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Notes / Reader | `(tabs)/(reading)/index.tsx` | ✅ | `[l1]/[l2]/reader/page.tsx` | Markdown editor, CRUD notes, TokenizedText, auto-save |
| Web Reader | `(tabs)/(reading)/web-reader.tsx` | ✅ | `[l1]/[l2]/web-reader/page.tsx` | URL fetch + tokenization works. **Missing**: notes sidebar (`ReaderSidebar`), page translation.  |
| EPUB Reader | `(tabs)/(reading)/epub.tsx` | ✅ | `[l1]/[l2]/epub/page.tsx` | Upload + parse + read works. Position/anchor save. |

### Reader Components

| Component | File | Status | Notes |
|---|---|---|---|
| TokenizedText | `components/TokenizedText.tsx` | ✅ | Core — tappable word tokens, lemmatization, dictionary popup |
| TabbedPanel | `components/TabbedPanel.tsx` | ✅ | Reusable tab bar + content switcher |
| EPUB Chapter Sidebar | `components/reader/epub-chapter-sidebar.tsx` | ✅ | Chapter TOC with prev/next nav |
| EPUB Cover | `components/reader/EpubCover.tsx` | ✅ | EPUB cover image rendering |
| Paginated Reader | `components/reader/PaginatedReader.tsx` | ✅ | Shared paginated content renderer (EPUB + notes reader) |

---

## 📚 (Vocab) Tab

| Screen | File | Status | Web Source | Notes |
|---|---|---|---|---|
| Dictionary Search | `(tabs)/(vocab)/index.tsx` | ✅ | `[l1]/[l2]/dictionary/page.tsx` | Search + recent searches + results cards |
| Saved Words | `(tabs)/(vocab)/saved-words.tsx` | ✅ | `[l1]/[l2]/saved-words/page.tsx` | Filter + sort + remove + export all work. Exports all saved words as JSON via native share sheet. |
| SRS Review | `(tabs)/(vocab)/review.tsx` | ✅ | `[l1]/[l2]/review/page.tsx` | Full SM-2 algorithm, due card computation, 4 ratings (again/hard/good/easy), undo, daily new card limit, "no cards due" & "all done" states, entry preloading |
| Word Detail | `(tabs)/(vocab)/word/[entryId].tsx` | ✅ | `dictionary/entry/...` | Definitions, examples, inflections, AI explanation |

### Dictionary Components

| Component | File | Status | Notes |
|---|---|---|---|
| Dictionary Popup | `components/dictionary/DictionaryPopup.tsx` | ✅ | Modal popup with word lookup |
| Dictionary Entry Card | `components/dictionary/DictionaryEntryCard.tsx` | ✅ | Headword, pronunciation, level, definitions |
| Save Button | `components/dictionary/SaveButton.tsx` | ✅ | Bookmark save/unsave toggle |
| Search Bar | `components/dictionary/SearchBar.tsx` | ✅ | With clear + loading spinner |
| Word List | `components/dictionary/WordList.tsx` | ✅ | Reusable FlatList for saved words |
| Lookup Source Indicator | `components/dictionary/LookupSourceIndicator.tsx` | ✅ | Shows which dictionary source provided the entry |
| Offline Banner | `components/dictionary/OfflineBanner.tsx` | ✅ | Offline availability status banner |

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
| Language Picker | `components/LanguagePicker.tsx` | ✅ | Language selection (L1/L2) |
| Language Picker Narrow | `components/LanguagePickerNarrow.tsx` | ✅ | Narrow layout variant |
| Language Picker Wide | `components/LanguagePickerWide.tsx` | ✅ | Wide layout variant |

### UI Primitives

| Component | File | Status | Notes |
|---|---|---|---|
| Dialog | `components/ui/dialog.tsx` | ✅ | Modal dialog primitive |
| Select | `components/ui/select.tsx` | ✅ | Select/dropdown primitive |
| Switch | `components/ui/switch.tsx` | ✅ | Toggle switch primitive |
| Tabs | `components/ui/tabs.tsx` | ✅ | Tab bar primitive |

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

## 📋 Features Not Yet Ported at All

> **Priority key:** 🔴 High (revenue/blocker) · 🟠 Medium (UX gap) · 🔵 Low (nice-to-have) · ⚪ Polish (auth) · ◻️ N/A

These exist in the Next.js web app but have **no mobile equivalent yet**:

| Feature | Web Source | Priority | Notes |
|---|---|---|---|
| In-App Purchase (IAP) | — | 🔴 High | Apple App Store / Google Play Store. See [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 5. |
| Subscription State (Context) | `use-subscription.ts` | 🔴 High | Unified subscription state management across web & mobile. Requires `SubscriptionContext` in `apps/mobile/contexts/`. See [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 4. |
| Sale Pricing | — | 🟠 Medium | Show sale banner + discounted prices when `type: 'sale'` prices are active in `prices.csv`. See [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 9. |
| Channel Subscribe/Actions | `channel-actions-menu.tsx` + `use-channel-preference.ts` | 🟠 Medium | Subscribe, unsubscribe, "not interested" per-channel preferences. Reusable menu component used on watch page and channel cards. |
| Inline Word Definitions | `inline-definition.tsx` | 🟠 Medium | Saved-words page shows definitions inline with module-level cache (no popup needed). Mobile requires tapping each word to open DictionaryPopup. |
| Text Action Menu | `text-action-menu.tsx` | 🟠 Medium | Select text in reader → floating menu (speak, copy, AI explain, translate, save). Mobile handles word taps via DictionaryPopup but missing multi-action selection menu. |
| Notes Sidebar (Web Reader) | `notes-sidebar.tsx` | 🟠 Medium | List of notes with rename/delete in web reader. Mobile web-reader currently has no notes panel. |
| Saved Word Source | `saved-word-source.tsx` | 🟠 Medium | Shows which video/article a saved word came from. |
| Dictionary Entry Detail | `dictionary/entry/[dictionaryId]/[entryId]/page.tsx` | 🔵 Low | Deep link target — word detail exists but full entry page missing |
| Local Tokenizer | — | 🔵 Low | Offline tokenization via local model/WebAssembly. Currently all tokenization requires a round-trip to the Python backend (`POST /dictionary/tokenize`). See [SPEC-016](../../docs/specs/016-mobile-local-tokenization.md). |
| Interaction Primitives (@rn-primitives) | — | 🔵 Low | Adopt `@rn-primitives` (Dialog, Select, Switch, Tabs, Drawer) for headless interaction behavior. See [ADR-0014](../../docs/adr/0014-rn-primitives-interaction-primitives.md). |
| Pitch Accent Display | `pitch-accent.tsx` | 🔵 Low | Japanese kana with pitch accent markings (morae splitting + accent kernel). Critical for JP learners. |
| Script Preference | `use-script-preference.ts` | 🔵 Low | Shows alternate script form next to headwords (simplified↔traditional Chinese, chữ Hán for VI, hanja for KO). |
| Password Reset (token) | `/password-reset` | ⚪ Polish | Complete after email link click |
| Verify Email | `/verify-email` | ⚪ Polish | Email verification landing |
| Delete Account | `/delete-account` | ⚪ Polish | |
| API routes | `api/` | ◻️ N/A | Not applicable to mobile — uses Python backend directly |

---

## 📅 Phased Implementation Plan

> Ordered by priority: revenue → core UX → learner-specific → infrastructure → auth polish.

### Phase 1: Monetization 🔴

| # | Feature | Effort | Dependencies | Spec |
|---|---|---|---|---|
| 1.1 | Subscription State Context | S | None | [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 4 |
| 1.2 | In-App Purchase (IAP) | L | 1.1 (needs context for feature gating) | [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 5 |
| 1.3 | Sale Pricing | M | 1.1 | [SPEC-014](../../docs/specs/014-subscription-payment-system.md) Phase 9 |

**Goal:** App Store submission readiness. IAP is a hard requirement for iOS App Store; SubscriptionContext is a prerequisite for both IAP and sale pricing.

---

### Phase 2: Saved Words UX 🟠

| # | Feature | Effort | Dependencies | Notes |
|---|---|---|---|---|
| 2.1 | Inline Word Definitions | M | None | Module-level cache + IntersectionObserver-style lazy load. Eliminates tap-to-open-popup friction on saved-words screen. |
| 2.2 | Saved Word Source | S | None | Shows originating video/article for each saved word. |

**Goal:** Bring saved-words browsing to parity with web. Currently mobile requires tapping every word individually to see its definition — the #1 UX gap for daily vocab review.

---

### Phase 3: Reader Experience 🟡

| # | Feature | Effort | Dependencies | Notes |
|---|---|---|---|---|
| 3.1 | Text Action Menu | M | None | Floating menu on text selection: speak, copy, AI explain, translate, save. Web uses portal-based positioning; mobile needs a bottom sheet or contextual overlay. |
| 3.2 | Notes Sidebar (Web Reader) | M | None | Note list with rename/delete in web reader. Requires `useReaderNotes` integration into the web-reader screen. |

**Goal:** Complete the reader experience. Text selection actions are expected by users coming from web; notes sidebar is already noted as missing in the web-reader STATUS entry.

---

### Phase 4: Content Discovery 🟡

| # | Feature | Effort | Dependencies | Notes |
|---|---|---|---|---|
| 4.1 | Channel Subscribe/Actions | M | `use-channel-preference` hook | Subscribe, unsubscribe, "not interested" per channel. Affects video recommendations. Reusable component — appears on watch page and channel cards. |

**Goal:** Channel preferences influence content recommendations and let users curate their feed.

---

### Phase 5: CJK Language Support 🟢

| # | Feature | Effort | Dependencies | Notes |
|---|---|---|---|---|
| 5.1 | Script Preference | S | None | Simplified↔traditional Chinese, chữ Hán (VI), hanja (KO). Pure display logic — reads existing settings, shows alternate script beside headwords. |
| 5.2 | Pitch Accent Display | S | None | Japanese kana with pitch accent markings. `@langplayer/utils` already exports `splitIntoMoras` + `applyPitchAccent`. |

**Goal:** Critical display features for Chinese, Japanese, Korean, and Vietnamese learners. Both are small, self-contained components.

---

### Phase 6: Infrastructure & Polish 🔵

| # | Feature | Effort | Dependencies | Notes |
|---|---|---|---|---|
| 6.1 | Interaction Primitives (@rn-primitives) | L | None (incremental adoption) | Replace current UI primitives with headless interaction behavior. See [ADR-0014](../../docs/adr/0014-rn-primitives-interaction-primitives.md). |
| 6.2 | Local Tokenizer | XL | Offline dictionary downloads (SPEC-013) | Offline tokenization via local model/WebAssembly. See [SPEC-016](../../docs/specs/016-mobile-local-tokenization.md). |
| 6.3 | Dictionary Entry Detail (full page) | M | None | Full entry page at `word/[entryId]` for deep linking. Current mobile word detail covers ~80% of the web page. |

**Goal:** Architecture improvements and deep linking support. Local tokenizer is the largest remaining feature — enables fully offline reading.

---

### Phase 7: Auth Completion ⚪

| # | Feature | Effort | Dependencies | Notes |
|---|---|---|---|---|
| 7.1 | Password Reset | S | Backend email config | Complete flow after email link click. |
| 7.2 | Verify Email | S | Backend email config | Email verification landing page. |
| 7.3 | Delete Account | S | None | Account deletion confirmation flow. |

**Goal:** Complete auth lifecycle. Web already handles these — mobile needs them for standalone app store distribution.

---

### Effort Legend

| Label | Meaning |
|---|---|
| S | Small — ~1–2 days |
| M | Medium — ~3–5 days |
| L | Large — ~1–2 weeks |
| XL | Extra Large — multi-sprint |

