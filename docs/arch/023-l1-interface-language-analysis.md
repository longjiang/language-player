# L1 / Interface Language Usage Analysis

## Metadata

- **Arch ID**: ARCH-023
- **Feature**: L1 (native / UI language) usage analysis — top interface languages actually used by active learners
- **Type**: analysis
- **Status**: accepted
- **Created**: 2026-08-10
- **Last Updated**: 2026-08-10
- **ROADMAP Phase**: Cross-cutting (user data & analytics)
- **Scope**: Supabase Postgres (`tfugoojrqybaoukgpqza`) user-data tables; Classic settings evidence; web/mobile coverage gap
- **Supersedes**: none
- **See also**:
  - [ARCH-021 — Language Study Activity Analysis](021-language-study-activity-analysis.md)
  - [ADR-0030 — Data-Driven Popular Target-Language (L2) List](../adr/0030-popular-l2-list-usage-data.md)
  - [ADR-0033 — UI Translation Locale Support](../adr/0033-ui-translation-locale-support.md)
  - [ARCH-011 — Settings Architecture](011-settings-architecture.md)
  - [SPEC-039 — Full Database Migration to Supabase](../specs/039-full-database-migration-supabase.md)
  - [ARCH-009 — Shared i18n Pipeline](009-shared-i18n-pipeline.md)
  - [ARCH-005 — Translation Keys Reference](005-translation-keys-reference.md)
  - `zerotohero-nuxt/store/settings.js` — Classic per-L2 `l1` persistence
  - `zerotohero-python-server/utils_mailer_lite.py` — MailerLite API helpers
  - `zerotohero-python-server/app_google_analytics.py` — GA4 API helpers
  - `zerotohero-python-server/routes/analytics.py` — GA4 Flask endpoints
  - `packages/shared/src/constants.ts` — `SUPPORTED_L1S` / `SUPPORTED_L2S`
  - `packages/shared/src/types.ts` — `SettingsV2` (currently has no `l1` field)

---

## Overview

This document records a point-in-time analysis of **which L1 (native / interface)
languages Language Player users are actually using**, using activity in
`user_watch_history` and the per-language L1 that Classic persists in
`user_settings.settings_classic.l2Settings[l2].l1`.

The headline finding is that **English is the dominant L1 in every window**,
even though Chinese is the dominant L2. In the rolling 30 days analyzed here,
English accounted for about **54% of all watch events** (and about **81% of
events that could be attributed to an L1 from settings**), with Russian,
Chinese, Arabic, and Vietnamese following. The long tail is very broad: 89
distinct L1 values appear in Classic settings.

This is the missing half of ARCH-021. ARCH-021 answered "what are users
studying?" (L2). This document answers "in what interface language are they
studying it?" (L1), which is the evidence needed to reorder or validate the L1
side of the language picker and to prioritize UI/translation coverage.

---

## Context

ARCH-021 used `user_watch_history` to rank target languages and showed that
Chinese dominates study activity. ADR-0030 then split the shared popular
language list into `POPULAR_L1S` and `POPULAR_L2S`, but the L1 list kept its
original hardcoded composition because there was no usage data for the L1
column. This analysis closes that gap.

L1 is not currently stored in the unified web/mobile settings schema
(`SettingsV2` has no `l1` field), and web/mobile keep the current L1 in
localStorage/cookies. The only cloud-side, per-user L1 evidence is Classic's
`settings_classic.l2Settings[l2].l1`, which records "the L1 the user used last
time when they studied this language" and is synced to
`public.user_settings`.

---

## Definitions & Criteria

The analysis uses the following definitions:

- **Active learner** — a distinct `user_id` with at least one row in
  `user_watch_history` during the window (same definition as ARCH-021).
- **L1 / UI language** — the value of
  `user_settings.settings_classic.l2Settings[l2].l1`, i.e. the L1 Classic
  recorded for the same target language as the watch event.
- **Event-attributed L1** — each watch event is assigned to the L1 recorded
  for that event's `l2`. This is the primary metric: one event, one L1.
- **Dominant L1 (user-level)** — for users who have multiple L1s in their
  `l2Settings`, the L1 with the most entries is used; ties are broken
  alphabetically. This gives a one-user-one-bucket secondary metric.
- **Missing** — active users/events with no usable L1 evidence (no settings
  row, no `l2Settings`, or no `l1` for the relevant L2).

Windows (run on 2026-08-10):

- **Rolling 30 days** — `now() - interval '30 days'` → 2026-07-11 through
  2026-08-10 UTC.
- **Calendar July 2026** — 2026-07-01 through 2026-07-31 UTC.
- **2026 YTD** — 2026-01-01 through 2026-08-10 UTC.
- **All-time** — first watch event (2023-10-02) through 2026-08-10.

---

## Data Sources & Evidence

| Table / source | Role |
|---|---|
| `public.user_watch_history` | Activity signal: one row per watch/position update with `date`, `user_id`, `l2` |
| `public.user_settings.settings_classic` | **Primary L1 evidence**: nested `l2Settings[l2].l1` per target language |
| `public.user_id_map` | Resolves 54 legacy numeric user ids to auth UUIDs |
| `public.user_history` | Older event-level L1 corroboration (item-level `l1` + `l2` + `date`; mostly 2021–2023) |
| `public.user_sync_log` | Recent settings-sync corroboration (entity `settings`, payload contains `settings_classic`) |
| `public.languages` | ISO code → language name lookup |

### Evidence base in settings

As of 2026-08-10:

| Measure | Count |
|---|---:|
| `user_settings` rows | 39,840 |
| Rows with non-null `settings_classic` | 39,832 |
| Rows with a `l2Settings` object | 39,608 |
| Users with at least one `l1` value | 39,594 |
| Per-L2 `l1` entries | 58,031 |
| Distinct `l1` values | 89 |

Top L1 values recorded in `settings_classic.l2Settings` (entries / distinct
users):

| L1 code | Entries | Users |
|---|---:|---:|
| `en` | 39,294 | 27,434 |
| `zh` | 9,023 | 7,291 |
| `ru` | 1,678 | 1,377 |
| `vi` | 1,602 | 1,384 |
| `es` | 826 | 655 |
| `ar` | 727 | 632 |
| `fr` | 542 | 416 |
| `hi` | 514 | 486 |
| `pt` | 443 | 335 |
| `tr` | 383 | 306 |
| `de` | 355 | 235 |
| `id` | 259 | 192 |
| `it` | 245 | 194 |
| `ja` | 221 | 153 |
| `pl` | 147 | 107 |
| `ko` | 132 | 112 |
| `ur` | 130 | 118 |
| `bn` | 98 | 94 |
| `fa` | 95 | 90 |
| `uz` | 90 | 79 |

The settings evidence is therefore overwhelmingly Classic-era data. It is the
best cloud-side source we have today, but it does not cover web/mobile users
whose L1 only exists in device storage.

---

## Findings

### 3.1 Rolling 30 days (2026-07-11 → 2026-08-10 UTC)

**2,886 watch events from 675 active users.** 1,908 events (66.1%) could be
attributed to an L1 via the matching L2's settings entry; 978 events (33.9%)
had no L1 evidence. 447 of 675 active users (66.2%) had at least one
L2-specific L1 match.

| Rank | L1 | Watch events | % of all events | Distinct users* | Distinct L2s |
|---:|---|---|---:|---:|---:|
| 1 | English (`en`) | 1,548 | 53.6% | 316 | 30 |
| 2 | Missing | 978 | 33.9% | 238 | 30 |
| 3 | Russian (`ru`) | 86 | 3.0% | 26 | 4 |
| 4 | Chinese (`zh`) | 45 | 1.6% | 21 | 9 |
| 5 | Arabic (`ar`) | 35 | 1.2% | 15 | 5 |
| 6 | German (`de`) | 32 | 1.1% | 5 | 6 |
| 7 | Vietnamese (`vi`) | 25 | 0.9% | 12 | 2 |
| 8 | French (`fr`) | 22 | 0.8% | 6 | 4 |
| 9 | Portuguese (`pt`) | 19 | 0.7% | 7 | 4 |
| 10 | Spanish (`es`) | 16 | 0.6% | 8 | 3 |
| 11 | Ukrainian (`uk`) | 14 | 0.5% | 2 | 2 |
| 12 | Japanese (`ja`) | 12 | 0.4% | 6 | 4 |
| 13 | Uzbek (`uz`) | 9 | 0.3% | 4 | 2 |
| 14 | Italian (`it`) | 8 | 0.3% | 4 | 1 |
| 15 | Indonesian / Thai (`id` / `th`) | 7 each | 0.2% | 3 / 2 | 3 / 2 |

\* Users can appear under multiple L1s if they study different L2s with
different recorded L1s.

When English is measured as a share of the **attributed** events only
(1,908), it is 81.1%; Russian is 4.5%, Chinese 2.4%, Arabic 1.8%, German
1.7%, and Vietnamese 1.3%.

**User-dominant L1** (one user per bucket, 450 users with evidence):

| L1 | Active users | % of 675 |
|---|---:|---:|
| English (`en`) | 322 | 47.7% |
| Missing | 225 | 33.3% |
| Russian (`ru`) | 26 | 3.9% |
| Chinese (`zh`) | 18 | 2.7% |
| Arabic (`ar`) | 14 | 2.1% |
| Vietnamese (`vi`) | 11 | 1.6% |
| Portuguese / German / Spanish (`pt`/`de`/`es`) | 7 each | 1.0% each |
| French / Japanese / Uzbek (`fr`/`ja`/`uz`) | 5 / 5 / 4 | 0.7% / 0.7% / 0.6% |
| Italian (`it`) | 4 | 0.6% |
| Indonesian (`id`) | 3 | 0.4% |
| Burmese / Dutch / Bengali / Ukrainian (`my`/`nl`/`bn`/`uk`) | 2 each | 0.3% each |

The remaining 1-user buckets are `th`, `tr`, `ko`, `ro`, `kk`, `lt`, `sw`,
`hu`, and `el`.

### 3.2 Calendar July 2026

**3,158 watch events from 705 active users.** 2,452 events (77.6%) were
attributable to an L1; 706 (22.4%) were missing. 507 of 705 users (71.9%) had
at least one L2-specific L1 match.

| Rank | L1 | Watch events | % of all events | Distinct users* |
|---:|---|---|---:|---:|
| 1 | English (`en`) | 2,019 | 63.9% | 360 |
| 2 | Missing | 706 | 22.4% | 207 |
| 3 | Russian (`ru`) | 77 | 2.4% | 27 |
| 4 | German (`de`) | 62 | 2.0% | 7 |
| 5 | Vietnamese (`vi`) | 59 | 1.9% | 25 |
| 6 | Chinese (`zh`) | 35 | 1.1% | 18 |
| 7 | Japanese (`ja`) | 33 | 1.0% | 9 |
| 8 | Spanish (`es`) | 25 | 0.8% | 10 |
| 9 | Arabic (`ar`) | 22 | 0.7% | 12 |
| 10 | French (`fr`) | 16 | 0.5% | 4 |
| 11 | Portuguese (`pt`) | 15 | 0.5% | 5 |
| 12 | Khmer (`km`) | 12 | 0.4% | 1 |
| 13 | Turkish (`tr`) | 12 | 0.4% | 6 |
| 14 | Burmese (`my`) | 11 | 0.3% | 2 |
| 15 | Persian / Italian (`fa`/`it`) | 8 each | 0.3% | 3 / 4 |

\* Users can overlap across L1s.

**User-dominant L1** (509 users with evidence): English 367 (52.1% of all
active users), missing 196 (27.8%), Russian 26, Vietnamese 25, Chinese 16,
Arabic 11, Spanish 9, German 8, Japanese 7, Portuguese 5, Turkish 5,
Italian 4, Uzbek 4, Persian 3, Korean 3, French 3, Indonesian 2, Burmese 2,
and 1 each for Swahili, Thai, Khmer, Ukrainian, Bengali, Yue Chinese, Polish,
Dutch, and Lithuanian.

### 3.3 2026 YTD (2026-01-01 → 2026-08-10 UTC)

**26,447 watch events from 4,455 active users.** 23,711 events (89.7%) were
attributable to an L1; 2,736 (10.3%) were missing. 3,578 of 4,455 users
(80.3%) had at least one L2-specific L1 match.

| Rank | L1 | Watch events | % of all events | Distinct users* |
|---:|---|---|---:|---:|
| 1 | English (`en`) | 17,295 | 65.4% | 2,318 |
| 2 | Missing | 2,736 | 10.3% | 1,045 |
| 3 | Russian (`ru`) | 1,077 | 4.1% | 243 |
| 4 | Chinese (`zh`) | 835 | 3.2% | 183 |
| 5 | Arabic (`ar`) | 831 | 3.1% | 118 |
| 6 | Vietnamese (`vi`) | 581 | 2.2% | 179 |
| 7 | Spanish (`es`) | 535 | 2.0% | 121 |
| 8 | French (`fr`) | 304 | 1.1% | 59 |
| 9 | German (`de`) | 234 | 0.9% | 42 |
| 10 | Korean (`ko`) | 223 | 0.8% | 18 |
| 11 | Portuguese (`pt`) | 202 | 0.8% | 51 |
| 12 | Japanese (`ja`) | 172 | 0.7% | 23 |
| 13 | Italian (`it`) | 160 | 0.6% | 29 |
| 14 | Indonesian (`id`) | 147 | 0.6% | 33 |
| 15 | Turkish (`tr`) | 137 | 0.5% | 43 |

\* Users can overlap across L1s.

**User-dominant L1** (3,597 users with evidence): English 2,345 (52.6% of all
active users), missing 858 (19.3%), Russian 228, Vietnamese 169, Chinese 162,
Arabic 119, Spanish 112, French 52, Portuguese 51, German 49, Turkish 37,
Indonesian 32, Italian 29, Japanese 21, Thai 19, Uzbek 18, Korean 17,
Polish 16, Dutch 12, Ukrainian 11, Persian 9, then 6 or fewer for the rest.

### 3.4 All-time (2023-10-02 → 2026-08-10 UTC)

**204,819 watch events from 24,615 active users.** 170,933 events (83.5%)
were attributable to an L1; 33,886 (16.5%) were missing. 16,925 of 24,615
users (68.8%) had at least one L2-specific L1 match.

| Rank | L1 | Watch events | % of all events | Distinct users* |
|---:|---|---|---:|---:|
| 1 | English (`en`) | 114,562 | 55.9% | 9,987 |
| 2 | Missing | 33,886 | 16.5% | 11,811 |
| 3 | Chinese (`zh`) | 12,825 | 6.3% | 1,844 |
| 4 | Vietnamese (`vi`) | 8,568 | 4.2% | 1,206 |
| 5 | Russian (`ru`) | 5,633 | 2.8% | 1,022 |
| 6 | Arabic (`ar`) | 5,049 | 2.5% | 472 |
| 7 | Spanish (`es`) | 3,615 | 1.8% | 472 |
| 8 | French (`fr`) | 2,949 | 1.4% | 299 |
| 9 | Turkish (`tr`) | 2,578 | 1.3% | 227 |
| 10 | German (`de`) | 2,223 | 1.1% | 188 |
| 11 | Portuguese (`pt`) | 1,882 | 0.9% | 251 |
| 12 | Indonesian (`id`) | 1,197 | 0.6% | 144 |
| 13 | Italian (`it`) | 1,115 | 0.5% | 147 |
| 14 | Japanese (`ja`) | 950 | 0.5% | 109 |
| 15 | Polish (`pl`) | 862 | 0.4% | 87 |

\* Users can overlap across L1s.

**User-dominant L1** (17,254 users with evidence): English 10,361 (42.1% of
all active users), missing 7,361 (29.9%), Chinese 1,592, Vietnamese 1,176,
Russian 966, Arabic 465, Spanish 429, French 250, Portuguese 223, Turkish
212, German 184, Indonesian 139, Italian 134, Hindi 115, Japanese 94,
Polish 71, Korean 64, Uzbek 56, Bengali 55, Persian 54, Ukrainian 50,
Thai 50, Dutch 48, Urdu 47, then 26 or fewer for the rest.

### 3.5 L1 → L2 pairs

The top L1→L2 pairs show that the **English UI + Chinese content** pair is
the core of the product. Rolling-30-day pairs (events / distinct users):

| L1 | L2 | Watch events | Users |
|---|---|---:|---:|
| English | Chinese | 994 | 253 |
| English | Japanese | 264 | 17 |
| English | English | 55 | 5 |
| Russian | Korean | 48 | 7 |
| English | French | 40 | 7 |
| Russian | Chinese | 36 | 18 |
| English | Vietnamese | 33 | 5 |
| English | Korean | 31 | 5 |
| English | German | 27 | 14 |
| Chinese | English | 21 | 7 |
| Arabic | Chinese | 20 | 8 |
| Vietnamese | Chinese | 20 | 11 |
| German | Chinese | 18 | 4 |
| English | Arabic | 16 | 5 |
| English | Russian | 14 | 8 |
| French | Chinese | 14 | 3 |
| Chinese | Japanese | 13 | 7 |
| Ukrainian | English | 13 | 1 |

2026 YTD shows the same shape at larger scale: English→Chinese 12,265 events
from 1,733 users, English→Japanese 970, English→French 714, English→Spanish
596, Vietnamese→Chinese 507, Russian→Chinese 489, Arabic→Chinese 472, and
English→German 456.

### 3.6 Corroborating evidence

**`user_history`** (Classic full-history blob, item-level `l1`/`l2`/`date`):
93,933 items from 16,790 users, with `l1` on 93,930. The top L1s are English
78,710 items / 11,992 users, Chinese 13,388 / 5,351, Spanish 418 / 136,
Russian 302 / 99, Arabic 206 / 82, French 195 / 44, Portuguese 156 / 62, and
Hindi 117 / 68. This corroborates English-first, Chinese-second across the
older history, but the data is mostly 2021–2023 (44,580 items in 2023,
49,200 in 2022, only 10 in 2026), so it is not a current-window source.

**`user_sync_log`** (entity `settings`, created 2026-08-08 through
2026-08-10): 667 settings sync operations from 79 users. 628 payloads contain
`settings_classic` with `l2Settings`; the l1 values in those payloads are
again English-heavy (`en` 1,130 entries, `ru` 104, `zh` 103, `es` 34, `ar`
29, `kk` 23, `ja` 18, `bn` 18, `it` 14). This confirms that Classic still
syncs the L1 evidence into the current row table.

### 3.7 MailerLite probe (2026-08-10)

MailerLite was also probed as a potential L1 source, using the
`MAILER_LITE_TOKEN` from `zerotohero-python-server/.env` (read-only API
calls only). The result is that **MailerLite cannot currently tell us a
user's L1**:

- The account has 27 groups. The Language Player groups are all
  subscription/marketing-lifecycle groups (`trial`, `engaged`, `disengaged`,
  `re-engaged`, `bucket`, `delete`, `monthly`, `annual`, `lifetime`), not
  language groups. The only language-named groups belong to the separate CZH
  (Chinese Zero to Hero) site.
- The MailerLite custom-field catalog contains only:
  `auth_user_id`, `user_id`, `role`, `last_name`, plus the default fields
  (`City`, `Company`, `Country`, `State`, `Zip`, `Phone`, etc.). There is no
  `l1`, `language`, `native_language`, `locale`, `interface_language`, or
  translation field.
- A sample of 500 active subscribers from each Language Player group
  confirmed the same field set in subscriber payloads. The default `Country`
  field is sparsely populated (9–105 non-empty values per sampled group) and
  is a country, not an L1, so it is not a reliable proxy.
- MailerLite **can** still be joined to Supabase via its `auth_user_id`
  custom field (present on ~97–100% of sampled subscribers), which could
  extend coverage or verify user identity, but it adds no L1 signal.

As of this analysis, `settings_classic.l2Settings[l2].l1` remains the only
cloud-side L1 source. **MailerLite data does not help in this case** — it
collects no language data, and `Country` is not a valid L1 proxy.

### 3.8 Google Analytics probe (2026-08-10)

Google Analytics **is** accessible and already integrated — no new `.env`
key is required. `app_google_analytics.py` uses a service-account credentials
file at `zerotohero-python-server/data/zh-zerotohero-c11972d83e48.json` and
GA4 property `281701377`. The Flask routes already exposed are:

- `GET /ga-active-users-by-city`
- `GET /ga-popular-language-pairs`
- `GET /ga-popular-features`

The GA page-path data is directly useful for L1 analysis because every
language-scoped route contains the pair: `/{l1}/{l2}/...`. A live probe of
`get_popular_language_pairs('2026-08-03')` (2026-08-03 → 2026-08-10,
inclusive) returned 274 language pairs. Aggregated by L1 over valid UI
languages, the top results were:

| L1 | Page-path views |
|---|---:|
| English (`en`) | 44,201 |
| Russian (`ru`) | 5,636 |
| Arabic (`ar`) | 1,721 |
| Chinese (`zh`) | 1,107 |
| Spanish (`es`) | 891 |
| Vietnamese (`vi`) | 683 |
| Indonesian (`id`) | 562 |
| Italian / French (`it` / `fr`) | 298 each |
| German (`de`) | 239 |
| Portuguese (`pt`) | 191 |
| Thai (`th`) | 133 |
| Hindi (`hi`) | 79 |
| Polish (`pl`) | 56 |
| Turkish (`tr`) | 54 |
| Japanese (`ja`) | 53 |

Top L1→L2 pairs from the same probe:

| L1 | L2 | Page-path views |
|---|---|---:|
| English | Chinese | 40,034 |
| Russian | Korean | 3,506 |
| Arabic | Chinese | 1,713 |
| Russian | Chinese | 1,714 |
| English | German | 728 |
| Vietnamese | Chinese | 616 |
| Spanish | Chinese | 557 |
| English | Japanese | 445 |
| Chinese | Japanese | 445 |
| English | English | 406 |
| Indonesian | Chinese | 396 |
| English | Spanish | 390 |
| Chinese | English | 361 |
| Russian | English | 296 |
| English | French | 295 |

This is a useful cross-check against the settings-based event attribution:
English is again the dominant L1, and the Russian→Korean and Russian→Chinese
pairs stand out much more strongly in page views than in watch events.

**What GA can and cannot compute for L1:**

- **Page views per L1 — yes.** The first two URL segments (`/{l1}/{l2}`)
  can be aggregated into per-L1 page-view totals.
- **Unique users per L1 from the URL — not directly.** `totalUsers` is
  per-page-path, so a user who visits two pages under the same L1 (or pages
  under two different L1s) is counted in multiple rows. Summing the
  page-path user buckets for 2026-08-03 → 2026-08-10 gives 11,707 users,
  while the property-level total is only 3,190 — a 3.7× inflation.
- **Unique users per browser language — available.** GA4 has a built-in
  `languageCode`/`language` dimension. This is the closest thing to a
  user-level L1 count GA can produce without extra instrumentation, but it
  reflects browser/OS language, not necessarily the L1 selected inside the
  app.

Combined view for 2026-08-03 → 2026-08-10 (URL page views vs. GA
browser-language users):

| L1 | URL page views | Browser-language users |
|---|---:|---:|
| English | 44,201 | 2,177 |
| Russian | 5,636 | 241 |
| Vietnamese | 683 | 134 |
| Chinese | 1,107 | 127 |
| French | 298 | 107 |
| Spanish | 891 | 94 |
| German | 239 | 51 |
| Italian | 298 | 41 |
| Portuguese | 191 | 33 |
| Arabic | 1,721 | 30 |
| Indonesian | 562 | 24 |
| Japanese | 53 | 23 |
| Polish | 56 | 22 |
| Turkish | 54 | 20 |
| Thai | 133 | 18 |

The Arabic row is a good illustration of why the two metrics differ: Arabic
has the #3 URL page-view count but only ~30 browser-language users, meaning
most of those page views came from browsers set to another language.

**To get exact one-L1-per-user from the app-selected L1**, GA needs either:

1. A user-scoped custom dimension (e.g. `l1`) set via `gtag('set',
   {'user_properties': {'l1': code}})` on every page load and language
   change, so `totalUsers` can be queried directly by that dimension; or
2. A BigQuery export of raw GA4 events, so we can deduplicate
   `user_pseudo_id`/`user_id` and assign each user a primary L1 in SQL.

Caveats for GA data:

- The current endpoint counts `screenPageViews`, not unique users. It
  measures page loads/navigation volume, not distinct-user reach.
- Page paths include every page under a language pair, so a heavy watch page
  or repeated navigation can inflate a pair's count.
- The metric is URL-based, not account/settings-based, and could include
  bots, non-app pages, or stale/deep links.
- It is the only direct, time-windowed L1 signal outside Classic settings,
  but it is URL-based corroborating evidence, not a replacement for
  settings-based attribution.

**Property verification (2026-08-10):** the raw report was re-queried with
`date` + `fullPageUrl`. All top URLs are on the live `languageplayer.io`
host, e.g. `languageplayer.io/en/zh/explore-media`,
`languageplayer.io/en/zh/levels`, and
`languageplayer.io/en/zh/video-view/youtube?...`. Daily totals for
2026-08-03 through 2026-08-10 show continuous current data (e.g. 8,472 views
on 2026-08-03, 10,497 on 2026-08-09, and 2,406 on the partial 2026-08-10),
confirming the probe is against the current production property, not a stale
one.

---

## Caveats & Data Quality

- **L1 is not persisted for web/mobile users.** `SettingsV2` has no `l1`
  field; the current L1 lives in `localStorage`/cookies. The missing bucket
  in every window is therefore not random — it is dominated by users with no
  Classic settings row. In the rolling window, 221 of 675 active users had no
  settings row at all.
- **`en` can be a default value.** Classic's `defaultL2Settings` defaults
  `l1` to `"en"`, and settings are written when a user picks any L1. A small
  share of `en` entries may therefore be defaults rather than conscious
  choices; this cannot be separated from the stored data.
- **`zh` vs `zh-Hans`/`zh-Hant`.** Classic records Chinese L1 as `zh`. The
  web/mobile UI locales are `zh-Hans` and `zh-Hant`. This analysis counts all
  Chinese as one L1 because the script variant is not recorded in the
  settings evidence.
- **Settings are snapshots, not event-time state.** `user_settings.updated_at`
  was stamped during the 2026-08-04 migration, and Classic only syncs
  settings on change. Historical events are attributed using the current
  stored `l1`, which may differ from the L1 actually used at event time.
- **Event-level user counts overlap.** A user who studies Chinese with an
  English UI and Japanese with a Chinese UI appears in both L1 buckets in the
  event-attributed tables. The user-dominant tables avoid this by assigning
  one L1 per user.
- **`user_history` is stale.** It corroborates the all-time picture but is
  mostly pre-2024 and is not a current-window signal.
- **MailerLite does not help here.** It stores no L1/language/locale data,
  its groups are subscription-lifecycle groups rather than language groups,
  and its default `Country` field is sparse and is not a proxy for L1. See
  [3.7 MailerLite probe](#37-mailerlite-probe-2026-08-10) for details.

---

## Reproducible SQL

All queries are read-only against the Supabase Postgres database
(`SUPABASE_DB_URL` in `zerotohero-python-server/.env`).

### Coverage and rolling-30-day event attribution

```sql
with wh as (
  select wh.id,
         coalesce(m.auth_user_id::text, wh.user_id) as uid,
         wh.l2,
         wh.date
  from public.user_watch_history wh
  left join public.user_id_map m on m.directus_user_id::text = wh.user_id
),
us as (
  select coalesce(m.auth_user_id::text, u.user_id) as uid,
         u.settings_classic
  from public.user_settings u
  left join public.user_id_map m on m.directus_user_id::text = u.user_id
)
select coalesce(us.settings_classic->'l2Settings'->wh.l2->>'l1', '(missing)') as l1,
       count(*) as watch_events,
       count(distinct wh.uid) as active_users
from wh
left join us using (uid)
where wh.date >= now() - interval '30 days'
group by 1
order by watch_events desc;
```

### User-dominant L1 (one user per bucket)

```sql
with wh as (
  select coalesce(m.auth_user_id::text, wh.user_id) as uid
  from public.user_watch_history wh
  left join public.user_id_map m on m.directus_user_id::text = wh.user_id
  where wh.date >= now() - interval '30 days'
  group by 1
),
us as (
  select coalesce(m.auth_user_id::text, u.user_id) as uid,
         u.settings_classic
  from public.user_settings u
  left join public.user_id_map m on m.directus_user_id::text = u.user_id
),
dom as (
  select us.uid,
         kv.l1v,
         count(*) as cnt,
         row_number() over (
           partition by us.uid order by count(*) desc, kv.l1v
         ) as rn
  from us,
       jsonb_each(coalesce(us.settings_classic->'l2Settings', '{}'::jsonb)) l2s,
       jsonb_each_text(l2s.value) as kv(k, l1v)
  where kv.k = 'l1'
  group by us.uid, kv.l1v
)
select coalesce(dom.l1v, '(missing)') as l1,
       count(*) as active_users
from wh
left join dom on dom.uid = wh.uid and dom.rn = 1
group by 1
order by active_users desc;
```

### Top L1 → L2 pairs (rolling 30 days)

```sql
with wh as (
  select coalesce(m.auth_user_id::text, wh.user_id) as uid,
         wh.l2
  from public.user_watch_history wh
  left join public.user_id_map m on m.directus_user_id::text = wh.user_id
  where wh.date >= now() - interval '30 days'
),
us as (
  select coalesce(m.auth_user_id::text, u.user_id) as uid,
         u.settings_classic
  from public.user_settings u
  left join public.user_id_map m on m.directus_user_id::text = u.user_id
)
select us.settings_classic->'l2Settings'->wh.l2->>'l1' as l1,
       wh.l2,
       count(*) as watch_events,
       count(distinct wh.uid) as users
from wh
left join us using (uid)
where us.settings_classic->'l2Settings'->wh.l2->>'l1' is not null
group by 1, 2
order by watch_events desc;
```

### Settings evidence base

```sql
select kv.l1v,
       count(*) as l1_entries,
       count(distinct coalesce(m.auth_user_id::text, u.user_id)) as users
from public.user_settings u
left join public.user_id_map m on m.directus_user_id::text = u.user_id,
     jsonb_each(coalesce(u.settings_classic->'l2Settings', '{}'::jsonb)) l2s,
     jsonb_each_text(l2s.value) as kv(k, l1v)
where kv.k = 'l1' and kv.l1v is not null
group by 1
order by l1_entries desc;
```

---

## Evidence Summary — Current UI Locale Support

The following evidence matrix was used to evaluate the 31 current UI locales;
the resulting decision is recorded in [ADR-0033](../adr/0033-ui-translation-locale-support.md).

Evidence basis:

- **Activity** — 2026 YTD watch events and distinct watch users attributed to
  each L1 via `settings_classic.l2Settings[l2].l1`.
- **Reach** — GA browser-language `totalUsers` (2026-08-03 → 2026-08-10) plus
  cumulative settings users.
- **Core keep threshold** — at least 50 YTD watch events **and** at least 10
  YTD distinct watch users.
- **Secondary signals** — settings users, GA page views, and GA browser
  users are reported for every locale; they provide context but are not a
  keep threshold.
- **Remove** — below the core threshold. The accepted ADR-0033 decision
  removed all 13 sub-threshold locales, including the five that were
  originally considered as a watchlist (`el`, `ro`, `hu`, `sv`, `hi`).

Chinese (`zh-Hans` / `zh-Hant`) is the only special case: the data records
Chinese L1 as `zh` and cannot split simplified vs. traditional, so the matrix
counts both locales together. Any decision to support only one script variant
is a product decision, not an evidence decision.

### Per-locale watch activity (events / distinct users)

This table is the full 31-locale decision-support data. The top-N tables in
the Findings sections are truncated previews; this table covers every locale
in every window, including all removed locales.

| Locale | R30 events / users | Jul 2026 events / users | YTD events / users | All-time events / users | Dominant R30 / Jul / YTD users | Verdict |
|---|---:|---:|---:|---:|---|---|
| `en` | 1,545 / 316 | 2,019 / 360 | 17,295 / 2,318 | 114,562 / 9,987 | 322 / 367 / 2,345 | **Core** |
| `zh-Hans` | 45 / 21 | 35 / 18 | 835 / 183 | 12,825 / 1,844 | 18 / 16 / 162 | **Core** (combined with zh-Hant) |
| `zh-Hant` | 45 / 21 | 35 / 18 | 835 / 183 | 12,825 / 1,844 | 18 / 16 / 162 | **Core** (combined with zh-Hans) |
| `ru` | 86 / 26 | 77 / 27 | 1,077 / 243 | 5,633 / 1,022 | 26 / 26 / 228 | **Core** |
| `vi` | 25 / 12 | 59 / 25 | 581 / 179 | 8,568 / 1,206 | 11 / 25 / 169 | **Core** |
| `es` | 16 / 8 | 25 / 10 | 535 / 121 | 3,615 / 472 | 7 / 9 / 112 | **Core** |
| `ar` | 35 / 15 | 22 / 12 | 831 / 118 | 5,049 / 472 | 14 / 11 / 119 | **Core** |
| `fr` | 22 / 6 | 16 / 4 | 304 / 59 | 2,949 / 299 | 5 / 3 / 52 | **Core** |
| `de` | 32 / 5 | 62 / 7 | 234 / 42 | 2,223 / 188 | 7 / 8 / 49 | **Core** |
| `pt` | 23 / 8 | 15 / 5 | 206 / 52 | 1,886 / 252 | 8 / 5 / 52 | **Core** |
| `tr` | 2 / 1 | 12 / 6 | 137 / 43 | 2,578 / 227 | 1 / 5 / 37 | **Core** |
| `id` | 7 / 3 | 4 / 2 | 147 / 33 | 1,197 / 144 | 3 / 2 / 32 | **Core** |
| `it` | 8 / 4 | 8 / 4 | 160 / 29 | 1,115 / 147 | 4 / 4 / 29 | **Core** |
| `ja` | 12 / 6 | 33 / 9 | 172 / 23 | 950 / 109 | 5 / 7 / 21 | **Core** |
| `ko` | 2 / 2 | 7 / 5 | 223 / 18 | 551 / 76 | 1 / 3 / 17 | **Core** |
| `th` | 7 / 2 | 2 / 2 | 100 / 19 | 384 / 54 | 1 / 1 / 19 | **Core** |
| `pl` | 0 / 0 | 5 / 1 | 75 / 18 | 862 / 87 | 0 / 1 / 16 | **Core** |
| `nl` | 2 / 2 | 2 / 2 | 51 / 12 | 632 / 53 | 2 / 1 / 12 | **Core** |
| `el` | 1 / 1 | 0 / 0 | 34 / 5 | 416 / 16 | 1 / 0 / 5 | Remove |
| `ro` | 1 / 1 | 0 / 0 | 40 / 6 | 192 / 25 | 1 / 0 / 6 | Remove |
| `hu` | 3 / 1 | 0 / 0 | 19 / 8 | 156 / 28 | 1 / 0 / 6 | Remove |
| `sv` | 0 / 0 | 0 / 0 | 17 / 6 | 98 / 26 | 0 / 0 / 6 | Remove |
| `hi` | 0 / 0 | 0 / 0 | 11 / 3 | 306 / 141 | 0 / 0 / 2 | Remove (legacy reach) |
| `fi` | 0 / 0 | 0 / 0 | 13 / 3 | 60 / 11 | 0 / 0 / 2 | Remove |
| `sr` | 0 / 0 | 0 / 0 | 15 / 2 | 41 / 7 | 0 / 0 / 1 | Remove |
| `sw` | 1 / 1 | 7 / 1 | 58 / 1 | 68 / 2 | 1 / 1 / 1 | Remove (single heavy user) |
| `ca` | 0 / 0 | 0 / 0 | 0 / 0 | 167 / 9 | 0 / 0 / 0 | Remove |
| `hr` | 0 / 0 | 0 / 0 | 0 / 0 | 16 / 2 | 0 / 0 / 0 | Remove |
| `af` | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 / 0 | Remove |
| `ga` | 0 / 0 | 0 / 0 | 0 / 0 | 8 / 2 | 0 / 0 / 0 | Remove |
| `no` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | Remove |

### Per-locale reach (settings + GA)

| Locale | Settings entries | Settings users | GA page views | GA browser users | Verdict |
|---|---:|---:|---:|---:|---|
| `en` | 39,294 | 27,434 | 44,201 | 2,177 | **Core** |
| `zh-Hans` | 9,023 | 7,291 | 1,107 | 127 | **Core** (combined with zh-Hant) |
| `zh-Hant` | 9,023 | 7,291 | 1,107 | 127 | **Core** (combined with zh-Hans) |
| `ru` | 1,678 | 1,377 | 5,636 | 241 | **Core** |
| `vi` | 1,602 | 1,384 | 683 | 134 | **Core** |
| `es` | 826 | 655 | 891 | 94 | **Core** |
| `ar` | 727 | 632 | 1,721 | 30 | **Core** |
| `fr` | 542 | 416 | 298 | 107 | **Core** |
| `de` | 355 | 235 | 239 | 51 | **Core** |
| `pt` | 445 | 336 | 191 | 33 | **Core** |
| `tr` | 383 | 306 | 54 | 20 | **Core** |
| `id` | 259 | 192 | 562 | 24 | **Core** |
| `it` | 245 | 194 | 298 | 41 | **Core** |
| `ja` | 221 | 153 | 53 | 23 | **Core** |
| `ko` | 132 | 112 | 0 | 9 | **Core** |
| `th` | 83 | 72 | 133 | 18 | **Core** |
| `pl` | 147 | 107 | 56 | 22 | **Core** |
| `nl` | 86 | 67 | 13 | 13 | **Core** |
| `el` | 28 | 18 | 21 | 8 | Remove |
| `ro` | 46 | 31 | 32 | 4 | Remove |
| `hu` | 51 | 37 | 0 | 4 | Remove |
| `sv` | 51 | 33 | 25 | 6 | Remove |
| `hi` | 514 | 486 | 79 | 0 | Remove (legacy reach) |
| `fi` | 15 | 14 | 0 | 4 | Remove |
| `sr` | 12 | 11 | 0 | 0 | Remove |
| `sw` | 3 | 3 | 2 | 0 | Remove (single heavy user) |
| `ca` | 15 | 11 | 0 | 1 | Remove |
| `hr` | 3 | 3 | 2 | 1 | Remove |
| `af` | 10 | 7 | 0 | 0 | Remove |
| `ga` | 3 | 3 | 0 | 0 | Remove |
| `no` | 1 | 1 | 0 | 0 | Remove |

## Related Documents

- [ARCH-021 — Language Study Activity Analysis](021-language-study-activity-analysis.md)
- [ADR-0030 — Data-Driven Popular Target-Language List](../adr/0030-popular-l2-list-usage-data.md)
- [ADR-0033 — UI Translation Locale Support](../adr/0033-ui-translation-locale-support.md)
- [ARCH-011 — Settings Architecture](011-settings-architecture.md)
- [SPEC-039 — Full Database Migration to Supabase](../specs/039-full-database-migration-supabase.md)
