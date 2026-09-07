# SPEC-094: Popup Dictionary External Search Panel

## Metadata

- **Spec ID**: SPEC-094
- **Feature**: "External Search" collapsible panel in the popup dictionary, listing curated external lookup links grouped by heading
- **Status**: draft
- **Created**: 2026-09-07
- **ROADMAP Phase**: Phase 4 (Reading) — dictionary popup
- **Web ref**: `apps/web/src/components/dictionary-popup.tsx` (image button), Classic `zerotohero-nuxt/components/LookUpIn.vue` + `EntryExternal.vue`
- **Mobile ref**: `apps/mobile/components/dictionary/DictionaryPopup.tsx` (image button)

## Overview

The popup dictionary today shows a single "Search Google Images" button (icon-only). This spec replaces that button with an **"External Search"** button (globe icon + label + downward chevron) that toggles a panel below it. The panel lists curated external lookup links grouped under three headings:

1. **Images** — Google Images and similar image search.
2. **Reference** — Wikipedia, Baidu Baike (for Chinese/han-script), usage trends (Google Ngrams), grammar wikis, etymology, etc.
3. **Dictionaries** — Wiktionary plus language-specific dictionaries (Jisho, 汉典 ZDIC, Cambridge, Naver, etc.).

Every link is a button that shows the site's **favicon**, a **title**, and an **external-link icon**. Clicking opens the target in a new tab (web) or the in-app browser (mobile). The panel has the same collapsible toggle behavior as the existing "Context Sentence" button, so the popup stays compact until the user expands it.

The option set is **per-language** — it depends on the L2 (target language) and, for a few sources, on the L1 (user's native language) and the L2's script properties (han/kana, etc.). The set is derived from Classic's `LookUpIn.vue` / `EntryExternal.vue`, which is the source of truth for which external sources exist for which language.

The **"Context Sentence"** and **"External Search"** toggles render as two equal-width buttons sharing one row (each `flex-1`, i.e. a 50/50 split) with identical icon / label / trailing-chevron styling, so the popup action row reads as one consistent pair.

## User Stories

- As a learner, I want to open a word's definition in a reference dictionary or see images for it, without leaving the popup, so I can deepen my understanding of a word I just looked up.
- As a Japanese learner, I want one-tap access to Jisho/Weblio/JPDB from the popup, matching what I already have in the Classic app.
- As a Chinese learner, I want direct links to 汉典 ZDIC and Baidu Baike for the characters I'm studying.

## Data Source (Classic)

The curated set comes from `zerotohero-nuxt/components/LookUpIn.vue` (the comprehensive per-language list) and `zerotohero-nuxt/components/EntryExternal.vue` (the per-language dictionary/encyclopedia list). Both are read-only references; do not edit Classic.

Sources and their availability (L2 = target language, L1 = native language, `han` = L2 uses Han script):

| Source | Group | Available when | URL template |
|---|---|---|---|
| Google Images | Images | always | `https://www.google.com/search?q={term}&tbm=isch` |
| Wikipedia | Reference | always | `https://{l1}.m.wikipedia.org/w/index.php?search={term}` |
| Baidu Baike | Reference | `l2.han` | `https://baike.baidu.com/item/{term}` |
| Usage Trends (Google Ngrams) | Reference | l2 ∈ {en, zh, fr, de, he, it, ru, es} | `https://books.google.com/ngrams/graph?content={term}&year_start={zh?1900:1800}&year_end=2019&corpus={langCorpus}&smoothing=3` |
| Grammar Wiki (AllSet) | Reference | `l2 === 'zh'` | `https://resources.allsetlearning.com/gramwiki/?search={term}` |
| 萌典 MOEDICT | Reference | `l2.han` | `https://www.moedict.tw/{traditional \| tify(term)}` |
| Etymology | Reference | `l2 === 'en'` | `https://www.etymonline.com/word/{term}` |
| Wiktionary | Dictionaries | always | `https://en.m.wiktionary.org/w/index.php?search={term}#{l2.name}` |
| 汉典 ZDIC | Dictionaries | `l2.han` | `https://www.zdic.net/hans/{term}` |
| Cambridge Dictionary | Dictionaries | `l2 === 'en'` | `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/{term}` |
| Jisho | Dictionaries | `l2 === 'ja'` | `https://jisho.org/search/{term}` |
| Weblio | Dictionaries | `l2 === 'ja'` | `https://ejje.weblio.jp/content/{term}` |
| JPDB | Dictionaries | `l2 === 'ja'` | `https://jpdb.io/search?q={term}` |
| JapanDict | Dictionaries | `l2 === 'ja'` | `https://www.japandict.com/{term}` |
| Tangorin | Dictionaries | `l2 === 'ja'` | `https://tangorin.com/words?search={term}&lang=eng` |
| Naver Ko-Ko | Dictionaries | `l2 === 'ko'` | `https://ko.dict.naver.com/#/search?query={term}` |
| Naver Hanja | Dictionaries | `l2 === 'ko'` | `https://hanja.dict.naver.com/#/search?query={term}&range=all` |
| Naver En-En | Dictionaries | `l2 === 'en'` | `https://english.dict.naver.com/english-dictionary/#/search?query={term}` |
| Naver Ko-En | Dictionaries | `l2 === 'ko' && l1 === 'en'` | `https://korean.dict.naver.com/koendict/dict/#/search?query={term}` |
| Naver En-Ko | Dictionaries | `l2 === 'en' && l1 === 'ko'` | `https://en.dict.naver.com/#/search?query={term}&range=all` |
| Naver Ja/Ko | Dictionaries | `l2 === 'ja' && l1 === 'ko'` | `https://ja.dict.naver.com/#/search?query={term}&range=all` |
| Naver Ko/Zh | Dictionaries | `(l2.han && l1 === 'ko') \|\| (l2 === 'ko' && l1.han)` | `https://zh.dict.naver.com/#/search?query={term}` |
| Naver Es/Ko | Dictionaries | `(l2 === 'es' && l1 === 'ko') \|\| (l2 === 'ko' && l1 === 'es')` | `https://dict.naver.com/eskodict/#/search?query=={term}` |
| Naver De/Ko | Dictionaries | `(l2 === 'de' && l1 === 'ko') \|\| (l2 === 'ko' && l1 === 'de')` | `https://dict.naver.com/dekodict/#/search?query=={term}` |
| Youdao (per-language) | Dictionaries | l1 === 'zh' and l2 ∈ {en, ja, fr, ko} | `http://dict.youdao.com/w/{langSlug}/{term}` |

The Classic app additionally generates a family of Naver `{l2}/KO` and `{l2}/EN` dictionaries for many languages, gated on the L1/L2 pairing. The shared builder reproduces the same logic with the same pairings.

## Implementation Plan

### Shared builder (platform-agnostic)

A pure function in `packages/shared/src/external-search.ts` that returns the grouped, filtered list given the word + language context. No React/RN imports — follows ADR-0003 (share logic, not views).

```ts
type ExternalSearchGroup = 'images' | 'reference' | 'dictionaries';

interface ExternalSearchLink {
  key: string;          // stable id for React keys
  title: string;        // i18n key or raw label
  url: string;          // full URL with the term substituted
  domain: string;       // e.g. "wikipedia.org" — used to build the favicon URL
}

interface ExternalSearchOptions {
  term: string;
  l1Code: string;       // ISO 639-1 native language
  l2Code: string;       // ISO 639-1 target language
  l2Name: string;       // localized target-language name (for Wiktionary fragment)
  l2Han: boolean;       // L2 uses Han script (from language data)
  l1Han: boolean;       // L1 uses Han script
  // Optional: the traditional-form of the term for CJK-enriched sources.
  traditional?: string;
}

function buildExternalSearchLinks(opts: ExternalSearchOptions): ExternalSearchLink[] { ... }
```

The builder groups links by the three headings and preserves insertion order (images → reference → dictionaries). It filters out inapplicable sources using the same availability predicates as Classic. The title is an i18n key (e.g. `external.wiktionary`) so both apps localize it independently.

### Favicons

Use the Google favicon service, which works for any domain without per-site assets:

```
https://www.google.com/s2/favicons?sz=64&domain={domain}
```

### Web (`apps/web`)

- `apps/web/src/components/dictionary-popup.tsx` — replace the icon-only image button with an **External Search** button (globe + `t('action.external_search')` + chevron). Clicking toggles the panel below, matching the Context Sentence button's expand/collapse. The panel renders the shared list. Web links open in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Remove the old `<a href={googleImagesUrl}>` image button (Google Images is now one item inside the Images group).
- The panel renders only when there is at least one applicable link.

### Mobile (`apps/mobile`)

- `apps/mobile/components/dictionary/DictionaryPopup.tsx` — same button in place of the icon-only image button. Toggling expands a panel. Links open via `Linking.openURL(url)` (or the existing `WebViewSheet`/in-app browser pattern).
- Remove the old image-button `ImageIcon` path.

### i18n

New keys (all 18 locales): `action.external_search` ("External Search"). Group headings reuse `title.external_images` / `title.external_reference` / `title.external_dictionaries` or add new keys. The per-source titles come from existing keys where available (`category.music` etc. are unrelated); otherwise add per-source keys (e.g. `external.wiktionary`) following the CSV workflow in `AGENTS.md`.

## States

- **Collapsed** — only the External Search button shows; the panel is hidden.
- **Expanded** — the panel lists grouped links. A group with no applicable links is omitted entirely. If no links apply at all (unlikely — Google Images and Wikipedia always apply), the button is hidden.
- **Loading / error** — none; the list is computed synchronously from static templates.

## Dependencies

- SPEC-033 (selection actions) / SPEC-084 (mobile selection) — the popup this panel lives in.
- Classic `LookUpIn.vue` / `EntryExternal.vue` — source of truth for sources.
- No new backend endpoints; the links are static URLs.

## Open Questions

- Favicon proxy: Google's `s2/favicons` service is used; confirm it's reachable and acceptable (a handful of regional sources like Baidu/Naver do expose favicons through it).
- Moedict/Youdao URLs use an aggressive/legacy URL shape; keep them as Classic does for faithfulness.
- Should the panel pre-fill the L2 language on Wikipedia (like the Wiktionary fragment) rather than always the L1 wiki? Classic uses L1 — kept for faithfulness.
