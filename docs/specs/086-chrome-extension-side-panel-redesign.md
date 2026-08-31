# SPEC-086: Chrome Extension — Web-Parity Side Panel Redesign

## Metadata

- **Spec ID**: SPEC-086
- **Feature**: Redesign the Chrome extension side panel to match the apps/web visual language and interaction model
- **Status**: implemented; manual browser parity verification pending
- **Created**: 2026-08-21
- **ROADMAP Phase**: Chrome Extension
- **Scope**: apps/chrome-extension/
- **Depends on**: SPEC-027, SPEC-028, SPEC-033, SPEC-035, SPEC-039, SPEC-041, SPEC-075, ADR-0003, ADR-0011, ADR-0015, ADR-0017
- **Web references**: apps/web/src/components/layout/, apps/web/src/components/ui/, apps/web/src/components/dictionary/, apps/web/src/components/about/, apps/web/src/app/[l1]/[l2]/settings/, and apps/web/src/app/docs/
- **Architecture reference**: docs/arch/019-chrome-extension-architecture.md

## Overview

The extension currently combines a native Chrome side panel with legacy extension-specific CSS, a legacy popup, and a dictionary card that differs from the web experience. This spec replaces that presentation with a single app-like side panel that follows the web app's Shadcn component patterns, semantic theme tokens, dialogs, language picker, settings list/detail layout, profile menu, documentation navigation, and compact dictionary entry cards.

The extension remains an independent Chrome UI. It must reproduce the web interaction and visual behavior, but it must not import React DOM components from apps/web or make shared packages depend on React. The extension gets its own Shadcn-compatible primitives and CSS build, with only the Language Player theme tokens overriding the default component theme.

### Web-parity contract

For every surface described as matching apps/web, “match” means matching both the rendered design and the observable logic. The implementation must use the current web source as its reference at implementation time; the file references in this spec identify the starting points, not frozen copies.

- Match the web component's structure, spacing, typography, states, focus behavior, keyboard behavior, responsive behavior, loading/empty/error states, event propagation, and modal/menu dismissal rules.
- Match the web component's data transformation, cache key, API request shape, authentication behavior, Pro gating, persistence, route construction, and i18n key selection. A visually similar extension-only shortcut is not parity.
- Reuse pure cross-platform utilities from packages/shared and packages/utils when the web uses them. Do not reimplement equivalent logic locally in the extension.
- When the web behavior changes before extension implementation completes, re-check the web source and update this spec/implementation rather than preserving an outdated approximation.
- If Chrome's side-panel constraints require a deliberate divergence, document the exact divergence, the reason, and the fallback behavior in the implementation PR and in docs/arch/019-chrome-extension-architecture.md.

The primary parity references are:

| Surface | Web source of truth |
|---|---|
| Language picker | apps/web/src/components/language-picker.tsx and language-picker-narrow.tsx |
| Profile/account | apps/web/src/app/[l1]/[l2]/profile/page.tsx and apps/web/src/components/layout/user-menu.tsx |
| Settings | apps/web/src/app/[l1]/[l2]/settings/_components/SettingsListPanel.tsx and settings/display/page.tsx |
| Help/docs | apps/web/src/app/docs/doc-sidebar.tsx and apps/web/src/app/docs/[...slug]/page.tsx |
| About | apps/web/src/components/about/about-dialog.tsx and about-content.tsx |
| Dictionary modal | apps/web/src/components/dictionary-popup.tsx |
| Dictionary cards | apps/web/src/components/dictionary-entry-card.tsx |
| AI explanation | apps/web/src/components/ai-explanation.tsx and packages/api-client/src/chat.ts |
| Pronunciation | packages/utils/src/pronunciation.ts, pitch-accent.ts, and the web call sites |

## User Stories

- As a learner, I want clicking the extension icon to open or close the side panel so I do not need a separate extension popup.
- As a learner, I want the side panel to show my current learning language, account controls, settings, help, and dictionary interactions in the same style as Language Player on the web.
- As a learner watching a supported video, I want the Subtitles tab to detect, tokenize, translate, and scroll subtitles without loading work that is not visible yet.
- As a learner on any web page, I want a Page Translation tab that translates the page progressively and retains the existing interactive page-reading behavior.
- As a signed-in learner, I want to manage my learning level and see my subscription and account actions without leaving the side panel except when a web-only destination is required.
- As a learner, I want a word lookup modal with the same compact dictionary cards, pronunciation, AI explanation, image search, and saving behavior as the web app.

## 1. Product and architecture decisions

### 1.1 The side panel is the only extension UI entry point

1. Remove action.default_popup from apps/chrome-extension/manifest.json.
2. Register chrome.action.onClicked in src/background.js.
3. The action handler opens the native side panel when it is closed and closes it when it is open. Use the same window-scoped close behavior already required by Chrome's global side-panel configuration.
4. Keep the existing keyboard commands, Alt+T and the alternate shortcut, as aliases for the same toggle operation.
5. The side panel close button calls the same toggle/close path. It must not disable page interactivity merely because the panel is closed; page tokenization remains controlled by its own setting.
6. The old popup files may be deleted or cleaned up after the migration. No user workflow may depend on them after this spec is complete.

### 1.2 UI component strategy

- Add an extension-local src/components/ui/ set of Shadcn-compatible primitives. At minimum this includes Button, Badge, Input, Label, Switch, Slider, Select, Tabs, Dialog, Popover, ScrollArea, Separator, and any command/search primitive needed by the language picker and settings/docs sidebars.
- Match the default apps/web Shadcn markup, variants, spacing, focus rings, radii, typography, and state selectors wherever the primitive exists in the web app.
- Do not carry forward legacy .lpv-* visual overrides for controls, cards, dialogs, menus, or typography. Old CSS may remain temporarily for page-host integration selectors, subtitle layout, and platform-specific page clearance, but side-panel UI must not depend on it.
- Use semantic tokens only: background, foreground, card, popover, muted, muted-foreground, primary, primary-foreground, border, ring, destructive, and related opacity variants. Do not add component-level hardcoded colors or named colors.
- Keep the extension's theme colors as the only intentional visual override. Derive icon or DOM colors that cannot use a class from the shared token source, following the existing theme-colors approach used by the web/mobile apps.
- Add a side-panel CSS build step that produces the utility classes and component styles required by the extension. build.mjs must bundle or copy the generated side-panel stylesheet and continue to copy the page-host stylesheet separately.
- This is a visual and logic port, not a shared-UI exception: apps/web components remain the reference implementation, while extension components are local to apps/chrome-extension.
- Implement each parity surface in this order: identify the web component and its state/data dependencies, extract the behavior contract, port the smallest local primitive composition, then port the feature state and API logic. Do not first create an extension-only visual approximation and retrofit web behavior later.
- For every ported component, keep a short source-reference comment or spec link beside non-obvious logic. If a class name, event handler, or state branch intentionally differs from web, explain why in code and in the architecture update.

### 1.3 Permission and store-review invariants

This design change must not expand the extension's permission footprint. The implementation may remove the default popup, add side-panel UI, and change bundled code, but it must not add a new manifest permission, optional permission, host permission, or permission-like capability.

- Do not add download, notifications, bookmarks, clipboardRead, clipboardWrite, identity, cookies, webNavigation, unlimitedStorage, history, or any other permission not already present in the current manifest.
- Do not add a downloads flow for dictionary entries, translated pages, help documents, screenshots, audio, or any other asset. External actions open a new tab using the existing tabs capability and normal web URLs.
- Keep the current permissions and host_permissions arrays unchanged except for removing action.default_popup. The existing webRequest, storage, scripting, sidePanel, tabs, and http/https host permissions remain the complete permission budget.
- Do not use a new API that implicitly requires a permission. If a proposed Shadcn or runtime dependency suggests one, reject that dependency and use the existing side-panel/background bridge instead.
- Do not broaden web_accessible_resources matches or add remote code. Help/docs content must be bundled or generated locally, and UI assets must remain extension-owned.
- Add a review-time manifest test that compares the redesigned manifest with the approved permission baseline from SPEC-074. The test must fail if any permission or host permission is added, even if the new feature appears to work.

Chrome Web Store approval safety is a release requirement, not an optional cleanup item. Any future feature that needs a new permission must be a separate spec and separate store-review decision; it is out of scope for SPEC-086.

### 1.4 Responsive side-panel width

- The panel uses a fluid layout with a minimum usable width and no horizontal overflow.
- At narrow widths, the top bar shows the logo mark only. Once there is enough width for the mark, language trigger, profile trigger, and close button without collision, show the Language Player wordmark beside the mark.
- Settings and Help collapse to a single-column layout at the narrow breakpoint. The left navigation becomes a selectable list above the current content.
- Dialogs are constrained to the side-panel viewport rather than the browser viewport. Their backdrop covers the entire side-panel document.

## 2. Side-panel shell

### 2.1 Top bar

The top bar is always present and uses extension-local Shadcn primitives.

From left to right:

1. Logo — Language Player logo mark. Show logo text only when the panel is wide enough, as defined in section 1.3.
2. Current language trigger — shows the current L2 name, matching the web header's language trigger. It opens the language picker dialog; it is not a plain text label.
3. User profile trigger — circular user icon when logged out, or the user's initial/avatar treatment when logged in. It opens the profile menu described in section 3.
4. Close button — standard Shadcn ghost icon button with an accessible label.

Remove the existing permanent “open in Language Player” action from the top bar. Where a web destination is useful, it appears as an explicitly named action in the relevant profile, dictionary, or Page Translation surface.

### 2.2 Main tabs

- Use a Shadcn Tabs component directly below the top bar.
- Subtitles is rendered only when the active tab is a first-class supported video host: Prime Video, YouTube, Netflix, or Disney Plus. Hulu and Max remain available through the existing detection pipeline but are labelled experimental in Help and may use the same tab when detected.
- Page Translation is available on every ordinary http/https page, except Language Player's own web assets and extension-internal pages.
- Persist the selected tab in chrome.storage.local as sidePanelTab: subtitles or page-translation. The next opening restores it when valid for the active site; otherwise use Page Translation on ordinary pages and Subtitles on first-class supported video pages.
- Switching tabs does not destroy already-loaded state. Hidden lazy work may pause, but returning to a tab resumes from its cache.

### 2.3 Side-panel state model

Extend the current mode model to distinguish the visible tab from the content source:

- SidePanelTab: subtitles or page-translation.
- SubtitleStatus: idle, detecting, ready, empty, or error.
- PageTranslationStatus: idle, loading, ready, empty, or error.

The content script/background bridge remains responsible for active-tab state, subtitle interception, seeking, page DOM inspection, and page actions. The side panel owns tab selection, dialogs, lazy rendering, and modal state.

## 3. Profile and account menu

The profile trigger uses a Shadcn Popover. Menu contents depend on authentication state.

### 3.1 Logged-out menu

- Login — opens the extension's existing authenticated login flow in a modal or dedicated side-panel view. It uses the existing Flask to Supabase proxy and refresh-token handling, not a second auth implementation.
- Settings — opens the Settings dialog described in section 4.
- Help — opens the Help dialog described in section 5.
- About — opens the About dialog described in section 6.

The logged-out menu must not show a fake user name, subscription, or account deletion action.

### 3.2 Logged-in menu

The first menu item is a user summary showing the user's name and email address. Selecting it opens the account/profile modal, not a web navigation.

The menu also contains Settings, Help, About, and Logout. Logout uses destructive text/icon treatment, clears extension auth state, saved-word session state, and account-dependent caches, then refreshes the menu and panel content.

### 3.3 Account/profile modal

The modal mirrors the relevant web profile content in a compact, scrollable dialog:

1. User info chip — name, email, and the same avatar/initial treatment as the web profile surface. The extension currently stores email and user ID in AuthState; obtain first/last name from the authenticated user response when available and fall back to email.
2. L2 level selector — use the same seven-level mapping and language-specific scale labels as apps/web LanguageLevelSelect. Persist locally and synchronize through the existing progress/user-settings row API when logged in.
3. Subscription status — show free, trial, monthly, annual, lifetime, expired, remaining time, renewal, and payment processor status using the web wording and badge hierarchy.
   - If the web profile would show Manage, Cancel, Upgrade, Renew, or Go Pro, render the same action label but link to the corresponding Language Player web URL in a new tab.
   - The extension must not collect payment details or manage Stripe, PayPal, or App Store subscriptions.
4. My activities — one button labelled with the web's activity concept. Open the Language Player web activity/profile destination in a new tab, preserving the current L1/L2 pair.
5. Delete Account — mirror the web profile flow: destructive section, explanation, confirmation modal, exact DELETE confirmation text, loading/error states, and successful logout.
   - Apply the web/server rule: block deletion while an active auto-renewing monthly or annual subscription exists: type monthly/annual, future expiry, and payment_customer_id.
   - Lifetime access and already-cancelled/non-renewing access are not blocked by this client gate, matching apps/web; the backend remains authoritative and may return HTTP 409.
   - Use DELETE /auth/delete-account through the existing authenticated extension fetch path. Never delete local data first in a way that prevents the server request from completing.

### 3.4 Account data and endpoint gap

The canonical authenticated user shape is already returned by Flask's login/session responses and is already consumed by web and mobile:

- Web maps user.firstName and user.lastName from POST /auth/login or POST /auth/session into the NextAuth session name, falling back to user.email.
- Mobile stores the returned user object in SecureStore and reads firstName, lastName, email, and id through AuthContext.
- The extension must extend its AuthState and login/session parsing to retain firstName and lastName, then use the same display-name rule: joined non-empty first/last name, otherwise email.

No new /auth/me endpoint is required for this design. A future profile-edit feature may need a separate API decision, but SPEC-086 only reads the existing login/session user payload.

## 4. Settings modal

Settings use a Shadcn Dialog with a two-panel list-to-detail layout matching apps/web and ADR-0015.

### 4.1 Layout

- Left panel: search input followed by grouped settings categories. The selected category uses the standard selected-row treatment.
- Right panel: the selected category's content. The right panel is independently scrollable.
- At narrow widths, render the list above the detail content and provide a back-to-settings-list control.
- Search uses shared SETTINGS_SEARCH_KEYS labels and localized values where possible. Search results update immediately and provide the same no-results and clear-search behavior as web.
- Settings changes apply immediately, persist in chrome.storage.local, and synchronize to the existing /user-settings pathway when authenticated. Migrate legacy extension keys once without resetting user preferences.

### 4.2 Display category

Implement the following controls using the current apps/web designs. Theme,
Typeface, Phonetics mode, and Phonetics scope use the web's **SegmentedRow**
segmented button group (not a `<select>` — apps/web moved off `Select` for
these multi-value choices); Show translation is a Switch; the sizes are
Sliders. Tokenized-text size ranges 16–36 px.

- Theme: Light, Dark, System.
- Preview sample containing tokenized L2 text and its L1 translation. The
  sample is the L2-specific short sentence (`getSampleSentence(l2Code)` from
  `@langplayer/shared`; apps/web uses the async `loadSampleShort`, but the
  extension bundles everything so the synchronous shared sentence is used).
- Show translation: on/off.
- Typeface: Default, Serif, Non-serif.
- Tokenized-text size: slider, 16–36 px.
- Translation size: 50%–100% relative to tokenized-text size.
- Leading: 1×–2×.
- Show phonetics: Above, Replace, Off.
- Show scope, shown only when phonetics are enabled: All words, Hard words only.

The preview uses the same token/ruby and translation rendering rules as the
subtitle transcript. It reflects changes immediately and must not make a
network request for every slider tick unless translation data is not already
available.

### 4.3 Additional categories

The two-panel shell exposes the settings categories the extension can actually
apply. **Display**, **Playback**, and **Speech** are ported. Playback currently
exposes only the control the extension can apply (smooth-scroll of the
transcript to the active cue) — the extension has no native video player, so
the web's captions-display-as, karaoke, and auto-pause controls are not shown
(they would have no effect). Speech exposes the TTS voice and rate, applied to
the transcript and dictionary speak buttons.

**Review and subtitle-search are intentionally NOT exposed.** They were added
as placeholder items that only rendered a "coming soon" state and cannot be
applied by the extension (there is no SRS new-card budget or subtitle-search
surface in the side panel). The two-panel shell must not expose a control that
the extension cannot apply.

## 5. Help modal

Help uses the same two-panel layout as Settings.

### 5.1 Left panel

- Search input matching the web docs sidebar behavior.
- Documentation titles grouped by the same categories used by packages/docs/content.
- Expand/collapse category controls.
- “On this page” table of contents for the selected document, based on its H2/H3 headings.
- Active document and active heading use the standard Shadcn/theme selected states.

### 5.2 Right panel content

The initial extension-specific help collection contains these pages.

#### Watching Videos

- Supported Services: Prime Video, YouTube, Netflix, and Disney Plus.
- Hulu and Max are experimental.
- Explain opening the side panel, subtitle detection, retrying detection, clicking words, saving words, playing a cue, changing the learning language, and showing/hiding translation.
- Explain that tokenization and translation load lazily as the learner reaches the relevant subtitles.

#### Reading Web Pages

- Explain opening Page Translation on any ordinary web page.
- Explain toggling page interactivity/tokenization, clicking a word for the popup dictionary, saving words, following links, and the limits imposed by pages that do not expose readable text.

#### Adjusting Settings

- Explain the Display controls, preview, phonetics modes, difficult-word scope, and text sizing controls.
- Explain that preferences persist between side-panel openings.

#### Managing Your Account

- Explain Login, the profile modal, L2 level, subscription status, My activities, links to web-only account actions, logout, and account deletion restrictions.

Help content is extension-local or loaded from the shared docs source at build time; it must not require the Language Player website to be open. All visible strings and document titles use the extension i18n pipeline.

## 6. About modal

Use the same content hierarchy and Shadcn dialog treatment as apps/web AboutDialog and AboutContent:

- Product name and logo.
- Short product description.
- Version/build information from the extension manifest.
- Links for contact, privacy, terms, and the Language Player website where the web app exposes them.
- Standard dialog close behavior, focus return, keyboard Escape behavior, and accessible title/description.

The extension may adapt copy for Chrome, but must not create a second visual design or use legacy popup styles.

## 7. Content tabs

### 7.1 Subtitles tab

The tab is rendered only for a supported or detected video context.

#### Opening and detection

- Selecting or restoring the Subtitles tab sends an explicit requestSubtitleDetection message to the active content script.
- The side panel immediately enters detecting and shows the localized “Detecting subtitles” state.
- Detection is idempotent. Reopening the panel or pressing Retry must not create duplicate subtitle fetches, timers, or cue lists.
- Existing platform-specific detection remains in content-entry.js, background.js, and subtitle-parsers.js; this spec changes the trigger and presentation, not the parsers.

#### Required states

| State | UI |
|---|---|
| Idle | Neutral empty state when no detection has been requested |
| Detecting | Spinner/progress indicator plus localized “Detecting subtitles” |
| No subtitles | “No subtitles found” plus a Retry button |
| Error | Localized/available error detail plus a Retry button |
| Ready | Scrollable tokenized subtitles and L1 translation when enabled |

- Do not use a text-only legacy status bar for these states. Use standard Shadcn empty-state, alert, button, and skeleton patterns.
- A ready transcript keeps active-cue highlighting, click-to-seek, keyboard cue seeking, lazy tokenization, lazy translation, word saving, line actions, and language mismatch handling.
- Translation is rendered only when Display enables it. Tokenization and translation are independently lazy: visible/near-visible cues load first, while off-screen cues remain inexpensive placeholders.
- The transcript scroll container is keyboard accessible and announces detection/error status without repeatedly announcing every cue update.

### 7.2 Page Translation tab

- The tab is available on all eligible sites, including pages with no video.
- On activation, request a readable page snapshot from page-content.js and load translated blocks progressively. The side panel must not scrape its own document.
- Translate visible/near-visible blocks first, then continue as the learner scrolls the side-panel translation. Cache by page URL, block identity, L1, and L2 so switching tabs does not repeat work.
- Preserve the current opt-in page interactivity/tokenization behavior. The tab must expose or clearly link to the existing interactivity toggle; enabling translation must not silently permanently alter a page without the user action that enables interactivity.
- Keep page-language/L2 mismatch warning behavior and the one-tap switch to the detected language.
- Required states are Loading, No readable content, Error with Retry, and Ready. Use the same standard empty/error/loading primitives as Subtitles.
- Page links may be followed through the existing pageFollowLink bridge. A page token lookup opens the new dictionary modal rather than a bottom-of-panel card.

## 8. Dictionary popup modal

### 8.1 Trigger and modal behavior

- Clicking a token in a transcript or interactive page opens a centered Shadcn Dialog modal, matching the web dictionary popup's sizing, backdrop, animation, close button, focus handling, and scroll behavior.
- The dictionary lookup card must never be pinned at the bottom of the side panel.
- Opening a second token cancels the previous lookup and aborts its in-flight request. Closing the modal cancels pending lookup, explanation, image, and phrase requests where supported.
- A token click stops propagation so it does not also seek a subtitle or toggle page behavior.

### 8.2 Header content

The modal header mirrors the web popup:

- Selected text/head word.
- Pronunciation in square brackets: [pronunciation].
- Lemma/inflected-form context when available.
- Standard close button.

### 8.3 AI explanation

- Show the same “Let DeepSeek explain”/AI action and Pro gating as apps/web AiExplanation.
- Reuse the existing extension authenticated API fetch path and the web prompt/follow-up semantics. Do not duplicate or rename existing translation keys merely because the extension uses a different component.
- Support the same preset follow-up questions: Inflection, Morphemes, Etymology, Syntax, and Synonyms.
- Render streamed or completed Markdown using the extension-local Markdown renderer, with clickable/tokenized L2 text behavior matching web where the extension supports it.
- For free users, show the same upgrade explanation and link the upgrade action to the Language Player web Go Pro page.

### 8.4 Search Images

- Provide the same Search Images action as web.
- Open the external image-search URL in a new browser tab.
- Stop event propagation so clicking Search Images never opens the dictionary entry card destination.

### 8.5 Pronunciation formatting parity

The extension must use exactly the same pronunciation formatter and precedence rules as apps/web. Do not display entry.pronunciation directly on an entry card and do not add a second extension-specific formatter.

- Import formatPronunciation from @langplayer/utils and pass the canonical L2 code in the same form used by the web DictionaryEntryCard and DictionaryPopup call sites.
- Render the returned string verbatim. formatPronunciation already adds square brackets and may append the Japanese pitch-pattern number; the card must not add another pair of brackets, strip pitch markers, normalize romaji, or replace it with raw IPA.
- Preserve the utility's cleaning and language-specific precedence: cleanPronunciation removes grammatical/source labels and trailing artifacts; Japanese prefers phonetic_detail.kana plus pitch_accent, formats kana downstep and romaji accent together, then appends circledPattern(p); Mandarin/Cantonese prefer the dictionary's tone-marked pinyin or Jyutping; Korean prefers romanization; Thai prefers learner romanization; other languages use the utility's IPA/romanization fallback order.
- The Japanese compact result must preserve the full web output, for example a value shaped like [hiragana with downstep, accented romaji]③ when the entry has pitch pattern 3. Pattern 0, missing pitch data, kana-only data, and fallback data must follow the exact branches in packages/utils/src/pronunciation.ts rather than a new approximation.
- Keep the same null behavior: no pronunciation string is rendered when formatPronunciation returns null.
- The speaker button's audio input and the visual pronunciation string are separate concerns. Use the same web speaker-button behavior for audio, while using formatPronunciation only for the displayed card value.
- If a script-qualified L2 code is stored by the extension, resolve it through the same canonical language-code path used by web before calling the formatter. Do not blindly split every code or silently turn Cantonese/variant codes into Mandarin.

Required formatter regression fixtures must cover, at minimum: Japanese with pitch data, Japanese kana without pitch data, Japanese fallback romanization, Mandarin tone-marked pinyin, Cantonese Jyutping taking precedence over Mandarin pinyin, Thai learner romanization over IPA, IPA fallback for another language, and cleaning of grammatical/wiki.local labels. The expected strings must be shared with or directly derived from packages/utils pronunciation tests so a web formatter change cannot silently leave the extension behind.

### 8.6 Compact dictionary entry cards

Each result uses the web's compact DictionaryEntryCard design:

- Card is clickable and opens the corresponding Language Player dictionary entry in a new tab.
- Clicking the speaker control only speaks the head word and does not open the entry.
- Clicking the bookmark control only saves/unsaves the word and does not open the entry.
- Header layout: head word, speaker icon, [pronunciation], and proficiency level badge(s).
- Body: italic part of speech and numbered definition list.
- Footer: dictionary name and Search Images aligned left; bookmark control aligned right.
- Use the same level filtering, formatting, script preference, saved-word state, and semantic token colors as web.
- The card uses default Shadcn card, border, hover, and focus treatment; no legacy .lpv-dict-* overrides remain in the side-panel implementation.
- Preserve context needed for saved words: token form, subtitle/page text, title, URL, cue timestamp where applicable, and current L1/L2.
- If no entry is found, show the standard empty lookup state and retain AI/search actions when valid for the selected text.

The extension entry-card implementation must follow the web card's prop and event semantics even though it uses local components:

- The displayed pronunciation is the formatted value from section 8.5, exactly as if the web card had received no override.
- Speaker and bookmark controls stop propagation and prevent the card navigation handler from running.
- Card navigation is the same dictionary entry route and uses the same dictionary ID, entry ID, language pair, and query parameters as the web route builder.
- The source row, Search Images action, match-type badge, alternate script, level filtering, saved-word state, and hover/focus treatment are ported from the current web card rather than redesigned independently.

### 8.7 Entry URL

Build the destination from the active language pair and the entry's dictionary and entry IDs, matching the web buildEntryRoute convention. The URL must use the canonical Language Player production site, not a localhost fallback. External navigation always opens a new tab with noopener and noreferrer.

## 9. Internationalization

- No visible UI string is hardcoded in extension source.
- Use the extension's flat, dot-free Chrome message keys in t() and chrome.i18n.getMessage(). Map them to existing dotted CSV keys through generate-locales.js where a matching translation already exists.
- Before adding keys, search translations.csv for an existing equivalent. Add new extension-only keys through the documented all-locales payload workflow, then regenerate _locales/.
- New Help-page content must be translatable. If the shared docs pipeline cannot be consumed at build time, add extension-local message keys for the four pages and their headings/TOC labels.
- Preserve the user's selected L1 immediately across the side panel, dialogs, menus, Help, Settings, and dictionary modal. Language changes update the runtime locale before the language picker closes.
- All new controls need accessible labels and translated tooltips where the web component has them.

## 10. Persistence and synchronization

| Preference/state | Storage | Notes |
|---|---|---|
| L1 | chrome.storage.local.l1Language | Existing key; updates runtime locale |
| L2 | chrome.storage.local.l2Language | Existing key; notifies video/page content scripts |
| Selected panel tab | `chrome.storage.local.sidePanelTab` + `sidePanelTabByTab` | Global last-selected tab, plus a per-tab map so switching back to a tab and reopening restores that tab's own sub-tab |
| Display/settings model | chrome.storage.local plus /user-settings when authenticated | Migrate legacy extension keys once |
| L2 level | Existing progress local/cloud pathway | Same seven-level mapping as web |
| Auth session | chrome.storage.local.lpv_auth | Existing rotating refresh-token implementation |
| Saved words | Existing row API/cache | Invalidate on logout/user change |
| Page translation cache | In-memory first; bounded local cache if needed | Key by page URL/content identity/language pair |

Storage listeners update an already-open panel without requiring a reload. A language change invalidates incompatible token/translation caches but may retain raw subtitle/page text.

## 11. API and message contracts

Reuse the existing API gateway and background bgFetch path for extension requests. Do not call Flask directly from arbitrary page contexts.

Expected existing API calls include:

- POST /auth/login, POST /auth/refresh, POST /auth/logout
- DELETE /auth/delete-account
- GET /user-subscription
- Progress and user-settings row APIs
- POST /dictionary/lookup
- Saved-word GET/PUT/DELETE row APIs
- Existing tokenization endpoints used by subtitle and page pipelines
- Existing translation endpoint(s) used by subtitle and page translation
- Existing AI chat endpoint and follow-up prompt behavior

New or revised runtime messages should be explicit and typed/documented in extension code:

- requestSubtitleDetection
- subtitleDetectionState
- panelState
- pageTranslationStart
- pageTranslationState
- pageLookup
- panelSeek
- pageFollowLink
- changeLanguage

Every message must be safe when the active tab has no content script, is a restricted Chrome page, or navigates while a request is in flight. The side panel must degrade to a retry or unsupported state rather than throw an unhandled promise rejection.

## 12. Accessibility and interaction requirements

- Use semantic buttons, links, tabs, dialogs, menus, switches, sliders, and comboboxes rather than clickable div elements.
- Dialogs trap focus, restore focus to their trigger, close on Escape, and expose a translated title. Backdrops close only when the web dialog behavior allows backdrop dismissal.
- Every icon-only button has an accessible label; decorative logo images have empty alt text.
- Keyboard users can reach the top bar, tabs, transcript/page content, modal controls, Settings categories, docs TOC, and dictionary actions in a predictable order.
- Focus rings use the semantic ring token and remain visible in both themes.
- Loading, empty, error, and success states are understandable without color alone.
- The panel supports reduced motion by disabling non-essential dialog/sidebar animations when prefers-reduced-motion is active.
- Right-to-left L1 layouts and RTL L2 text follow web direction behavior without reversing icon meaning or speaker/bookmark placement unexpectedly.

## 13. Implementation plan

Implementation must proceed in dependency order. Keep the current transcript/page behavior working until the replacement surface has equivalent state coverage. Do not combine a permission/manifest change, a message-contract change, and a large visual rewrite in one unverified step.

### Phase 0 — Baseline, parity inventory, and permission freeze

1. Record the current manifest permissions, optional permissions, host permissions, web-accessible resources, action configuration, and build outputs as the SPEC-086 baseline. The baseline must agree with SPEC-074.
2. Add a small manifest regression check before changing UI code. It must fail on any added permission, optional permission, host permission, widened web-accessible-resource match, or remote-code mechanism. Removing action.default_popup is the only expected manifest behavior change.
3. Inventory each current side-panel capability and its source of truth: active-tab tracking, subtitle detection, cue seeking, page lookup, page interactivity, auth refresh, saved words, subscription, and settings storage. Record the current runtime messages and response shapes before renaming or extending them.
4. Make a web parity checklist for every reference in the table in section 1. The checklist must include screenshot/state comparisons, API/request comparisons, i18n keys, keyboard and dismissal behavior, and edge cases.
5. Add pronunciation golden fixtures using the current packages/utils formatter tests. Include Japanese pitch, Japanese fallback, Mandarin, Cantonese, Thai, and IPA fallback cases before porting the new cards. This prevents a card migration from hiding pronunciation regressions.
6. Resolve the authenticated user-profile data dependency before implementing the profile modal. Extend the extension's existing login/session parsing and AuthState to retain firstName and lastName exactly as web and mobile do; do not add an /auth/me call or backend permission dependency.

### Phase 1 — Manifest-safe side-panel foundation

1. Remove action.default_popup and add the action click toggle using the existing sidePanel and tabs permissions. Verify that the action click, keyboard commands, close button, and global side-panel close behavior all use one toggle helper.
2. Add the extension-local Shadcn-compatible primitives and token stylesheet without importing apps/web UI code. Keep the existing page-host content.css separate from the new side-panel stylesheet so page CSS cannot leak into dialog/card layout.
3. Port the web token definitions, typography defaults, radii, focus rings, and component variants. Override only the Language Player theme colors. Audit the generated CSS for hardcoded legacy panel colors and old .lpv-dict/menu/dialog selectors.
4. Add a minimal ThemeProvider/storage adapter that resolves light, dark, and system before the first meaningful paint. Test system-theme changes while the panel is open.
5. Build the new top bar and Tabs shell with placeholder content first. Verify narrow and wide panel widths, focus order, Escape behavior, reduced motion, RTL direction, and no horizontal overflow before moving feature content into it.
6. Add sidePanelTab persistence and active-tab validity rules. Keep the old mode/state bridge available until the new tab shell can render both existing video and page states.

Careful points: do not use the old popup as a hidden fallback; do not request any permission to implement a menu, dialog, external link, or theme; do not make the extension side panel depend on a web page or a network-loaded stylesheet.

### Phase 2 — Typed state and message bridge hardening

1. Define typed state objects for tab, active tab ID, video/page source, detection status, current language pair, mismatch state, lookup state, and retry generation. Keep raw subtitle/page data separate from presentation state so switching tabs does not refetch it.
2. Add explicit requestSubtitleDetection and pageTranslationStart messages. Make them idempotent and generation-aware so a retry or tab switch cannot allow an older fetch to overwrite a newer result.
3. Keep the background relay tagged by sender tab ID. On active-tab changes, clear only presentation state that belongs to the old tab and pull the new tab's current state. Handle restricted pages, missing content scripts, navigation, and side-panel open races as ordinary unsupported/error states.
4. Preserve existing message names and response shapes where possible. If a message must change, update content-entry.js, page-content.js, background.js, and sidepanel.tsx together, then add a message-contract test or deterministic fixture.
5. Add logging at the bridge boundaries using the extension logger: request, accepted, ignored as stale, no content script, retry, and terminal error. Do not add direct console calls.

Careful points: detection must not be triggered both by panel open and by every state push; a panel reconnect must not duplicate ports or listeners; a tab switch must not display the previous tab's dictionary modal or subscription state.

### Phase 3 — Content tabs and lazy pipelines

1. Port the Subtitles tab state machine first. Map existing parser/detection results into Detecting, No subtitles, Error, and Ready states without changing platform-specific subtitle interception or timestamp parsing.
2. Add the Retry action with a new request generation and explicit cancellation/cleanup. Confirm that repeated retries do not duplicate timers, network listeners, cue arrays, or active-cue tracking.
3. Port the existing transcript into the new token-based design. Preserve seek-on-line-click, active cue scroll, keyboard cue navigation, line actions, mismatch banner behavior, saved-word context, and the free-account transcript cap.
4. Port lazy tokenization and translation after raw cue rendering works. Keep tokenization and translation independent so a translation failure does not discard usable tokenized text. Match web cache keys, near-viewport thresholds, cancellation, and loading placeholders where the extension can support them.
5. Port the Page Translation tab second. Extend page-content.js to provide a readable block snapshot and progressive translation state to the side panel; do not scrape the side-panel DOM. Reuse the current page interactivity/tokenization bridge and keep its opt-in behavior explicit.
6. Add page-language mismatch, readable-content empty state, retry, link-following, and page navigation cleanup. Cache only bounded, language-keyed data and invalidate it on URL, L1, L2, or relevant Display-setting changes.
7. Verify both tabs on supported video pages, ordinary article pages, pages with no readable text, restricted pages, single-page-app navigation, and rapid open/close/tab-switch sequences before porting account modals.

Careful points: page translation must not silently tokenize or rewrite a page merely because the tab was opened; visible translated blocks must never be mistaken for source blocks; subtitle detection must remain available for all currently supported platforms even when the first-class Help list names only four.

### Phase 4 — Shared language and settings state

1. Port the web language picker behavior before profile/settings UI. Use the web picker component and shared language lists as the behavioral reference, persist L1/L2 through the existing storage keys, update the runtime locale immediately, and notify both content-script pipelines.
2. Match web handling for Chinese script preference, canonical L2 codes, language names, popular/all language search, selection validation, cancel, confirm, and current-pair initialization.
3. Port the Settings two-panel shell using the web SettingsListPanel category grouping, row selection, localized search keys, no-results state, and narrow-screen fallback. Keep settings detail rendering local to the extension.
4. Port Display controls and preview first. Bind every control to the same settings fields and value ranges as web, then thread those settings into transcript/page/dictionary rendering before exposing the control to users.
5. Port Playback, Speech, Review, and subtitle-search categories only after their underlying extension consumers are identified. Do not show a web setting if the extension cannot apply it; document any intentional unsupported row.
6. Migrate old extension keys once, with explicit precedence and a fallback for malformed values. Test persistence while logged out, cloud hydration while logged in, logout/login as another user, and an already-open panel receiving a storage change.

Careful points: language switching can invalidate token and translation caches; L1 changes must re-render every open menu/dialog; Display preview values must match actual transcript values; the settings modal must not accidentally use web routes as a substitute for local settings.

### Phase 5 — Account, Help, and About parity

1. Port the web profile menu states first: loading, logged out, logged in, user summary, menu dismissal, and logout cleanup. Reuse the existing extension auth single-flight refresh path.
2. Implement the profile modal using the verified user profile response, the web level mapping, GET /user-subscription shape, and existing progress/user-settings APIs. Link web-only account actions to canonical production URLs in one centralized URL helper.
3. Port Delete Account only after subscription state loading is reliable. Match the web predicate, confirmation text, HTTP 409 handling, error state, and post-success cleanup. Test expired, lifetime, cancelled, active-renewing, missing, and subscription-fetch-error cases.
4. Port the Help two-panel navigation from the web docs sidebar: search, categories, selected page, H2/H3 TOC, active heading, keyboard navigation, and narrow fallback. Bundle content locally or generate it at build time; do not add download permission or fetch a remote document at runtime.
5. Port About last because it has no state dependency. Verify version source, links, focus behavior, and localized content.

Careful points: account deletion must remain possible when the subscription read fails unless the backend rejects it; no local logout may race with account deletion; Help links must not accidentally navigate the side-panel document away from the app shell; external links must use the existing tabs capability only.

### Phase 6 — Dictionary modal and exact web card parity

1. Extract a side-panel lookup controller that accepts the same logical token/context inputs as the web DictionaryPopup. Add AbortController/generation handling before changing visuals.
2. Port the modal shell and lookup states: opening, loading, API error, no entry, phrase loading, standard results, and close/reopen. Match the web dialog size, scroll region, animation, focus return, and backdrop behavior within Chrome's side-panel viewport.
3. Port the compact DictionaryEntryCard structure and event boundaries. Before using live results, verify card click, speaker click, bookmark click, Search Images click, and keyboard activation independently.
4. Wire pronunciation through packages/utils formatPronunciation exactly as specified in section 8.5. Do not copy the legacy extension card's raw entry.pronunciation behavior. Run the golden fixtures and compare exact strings, including Japanese pitch markers and circled pattern numbers.
5. Port level filtering, alternate script, source label, match type, saved-word resolution, save context, and canonical entry-route construction from apps/web. Keep card navigation and external image links separate from local button events.
6. Port AI explanation and follow-ups only after the standard card works. Match the web prompts, streaming/error/loading behavior, Pro gate, Markdown rendering, and follow-up state reset when the selected token changes.
7. Replace the old bottom-of-sidebar card path only after the modal works for both subtitle tokens and page tokens. Delete the old path after a regression pass, not before.

Careful points: an entry can have a valid head word but no formatted pronunciation; dictionary and token pronunciation are not interchangeable; clicking any nested speaker/bookmark/image control must never open the entry URL; entry routes must use the same IDs and language codes as web.

### Phase 7 — Cleanup, store-safety audit, and release verification

1. Remove popup-only UI and obsolete side-panel presentation code after all replacement flows are reachable from the icon, profile menu, and tabs.
2. Run a source audit for hardcoded UI strings, dotted Chrome i18n keys, direct console calls, ungated logs, hardcoded colors, raw entry pronunciation, and duplicate web logic that should use shared utilities.
3. Regenerate extension locales and verify every new key has the required locale coverage and placeholder definitions.
4. Run the manifest permission regression check and compare the final manifest against SPEC-074. Confirm no download permission or any other new permission was added, no host permission was widened, and no remote code or remote stylesheet was introduced.
5. Run the extension build only with the required approval and verify the generated sidepanel bundle, stylesheet, manifest, locale assets, and copied static files. Do not treat a successful bundle as sufficient UI verification.
6. Manually verify the unpacked extension on each existing supported host plus an ordinary article page, at narrow and wide side-panel widths, in light/dark/system themes, with logged-out and logged-in accounts, and with Japanese, Mandarin, and at least one Latin-script L2.
7. Update docs/arch/019-chrome-extension-architecture.md to the as-built state, including the new side-panel tree, state/message contracts, permission invariants, pronunciation dependency, and build output.
8. Update SPEC-086 status and acceptance evidence only after the build, manifest audit, and manual parity checks are complete.

## 14. Acceptance criteria

### Shell and navigation

- Clicking the extension icon opens the native side panel; clicking it again closes it.
- Keyboard shortcuts and the close button use the same toggle behavior.
- No default extension popup appears.
- The top bar shows logo, responsive wordmark, current L2 trigger, profile trigger, and close control with no overflow at narrow and wide panel sizes.
- The selected tab survives close/reopen and invalid-tab fallback works.

### Theme and components

- Side-panel controls use extension-local Shadcn primitives with default designs.
- Light, dark, and system themes work across the shell, dialogs, cards, transcript, and Settings/Help surfaces.
- Only semantic theme tokens and the Language Player theme color differ from the default component design.
- No legacy dictionary/menu/dialog override is needed for normal layout.
- Each parity surface has been checked against its current apps/web source for structure, behavior, state handling, API shape, i18n, and interaction boundaries; visual resemblance alone is not accepted.

### Store safety

- The final manifest has no new permission, optional permission, host permission, web-accessible-resource match, remote code path, or remote stylesheet.
- In particular, the redesign does not request download permission and does not add any download workflow.
- The manifest regression check passes against SPEC-074's approved permission baseline.

### Account and Settings

- Logged-out and logged-in menus expose the correct actions.
- Profile shows user info, L2 level, subscription status, My activities, and delete-account state.
- Delete Account is blocked for an active auto-renewing subscription, requires exact confirmation, handles backend 409/error, and clears the session only after success.
- Settings search, two-panel navigation, Display controls, preview, and persistence work in both themes and at narrow width.

### Help and About

- Help opens as a two-panel modal with search, document categories, selected document, and H2/H3 TOC.
- All four required Help pages are available and localized.
- About matches the web content hierarchy and includes extension version information.

### Content and dictionary

- Supported-video Subtitles detection shows Detecting, No subtitles plus Retry, Error plus Retry, and Ready states.
- Subtitle tokenization and translation load lazily and retain seek/scroll/saving behavior.
- Page Translation works on eligible ordinary pages and loads progressively without scraping the side panel.
- Token clicks open a modal dictionary lookup.
- Dictionary cards match the web compact design and route card clicks to the web entry, while speaker and bookmark clicks remain local.
- Entry-card pronunciation is rendered from packages/utils formatPronunciation with the same canonical L2 code and exact output as apps/web, including Japanese kana/downstep, accented romaji, and pitch-pattern number when available.
- AI explanation, preset follow-ups, image search, and Pro gating match web behavior.

### Quality and regression

- Extension i18n uses flat Chrome keys and all required locale files are regenerated.
- No new unprefixed or ungated extension console calls exist.
- No card or modal contains a duplicate local implementation of web pronunciation formatting, entry routing, subscription predicates, or AI prompt/follow-up logic when the shared/web implementation can be reused.
- Restricted tabs, missing content scripts, navigation races, API failures, empty results, expired sessions, RTL languages, and reduced motion have tested fallback behavior.
- node apps/chrome-extension/build.mjs succeeds and the resulting unpacked extension loads without manifest, i18n, or runtime errors.

### Implementation evidence

The implementation is split into independently rebuilt commits:

- `a2a59bed` — baseline and permission regression guard
- `27513c8a` — side-panel foundation and action toggle
- `fd41d6be` — typed subtitle/page state bridge hardening
- `8f4ed1aa` — lazy Page Translation tab
- `1ce632b7` — language picker and Display settings
- `6e4b81b4` — account, Help, About, login/logout, and subscription flows
- `ea4d4554` — dictionary modal surface
- `7bd9366a` — compact dictionary cards, shared pronunciation formatting, and event boundaries
- `acecab58` — Examples from Videos AI follow-up parity

Every implementation phase ran `node apps/chrome-extension/build.mjs` and
`node scripts/check-extension-permissions.mjs`. The shared pronunciation
fixtures pass with 10 tests. Manual browser verification across supported hosts,
widths, themes, accounts, and languages remains a release check rather than
something proven by the bundle alone.

## Open Questions

1. Confirm whether the four first-class video services should be the only services shown in the Subtitles tab, or whether Hulu and Max should appear there with an Experimental badge when detected. This spec assumes the latter is acceptable while Help clearly labels them experimental.
2. Confirm the production web host for generated account and dictionary links if it changes from https://languageplayer.io or the currently configured Language Player production URL. The implementation must centralize this value rather than hardcode multiple variants.
3. Confirm whether Help content should be copied into the extension at build time from packages/docs/content or maintained as four extension-specific documents. This spec requires the content to work offline from the website.
