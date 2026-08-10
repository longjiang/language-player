# Language Study Activity Analysis

## Metadata
- **Arch ID**: ARCH-021
- **Feature**: Language study activity analytics — top languages studied (rolling month, calendar month, annual, cumulative)
- **Type**: analysis
- **Status**: accepted
- **Created**: 2026-08-08
- **Last Updated**: 2026-08-08
- **ROADMAP Phase**: Cross-cutting (user data & analytics)
- **Scope**: Supabase Postgres (`tfugoojrqybaoukgpqza`) user-data tables; applies to every app that writes watch history, progress, or saved words
- **Supersedes**: none
- **See also**:
  - [SPEC-039 — Full Database Migration](../specs/039-full-database-migration-supabase.md)
  - [Classic App Architecture](001-classic-app-architecture.md)
  - [Python Backend Architecture](003-python-backend-architecture.md)
  - [Saved Words Data Flow](014-saved-words-data-flow.md)
  - [ARCH-023 — L1 / Interface Language Usage Analysis](023-l1-interface-language-analysis.md)

---

## 1. Overview

This document records a point-in-time analysis of which languages Language Player users actually studied, using the Supabase user-data tables that survived the Directus migration (SPEC-039). The analysis was run on 2026-08-08 and covers four windows:

- **Rolling 30 days** (2026-07-10 through 2026-08-09 UTC)
- **Calendar July 2026**
- **Annual** (2024, 2025, 2026 YTD)
- **All-time** (first recorded watch event 2023-10-02 through 2026-08-09)

The headline finding: **Chinese is the dominant studied language in every window**, accounting for roughly 64% of watch events in the last 30 days and ~52% of all recorded watch events. Japanese, English, Korean, and French fill out the top five, with German and Spanish close behind.

The analysis uses `user_watch_history` as the primary signal because it is the only table that stores a real per-event date (`date`) alongside a resolved `l2` code. `user_progress` is cumulative per `(user, language)` and its `updated_at` timestamps were stamped during the Aug 4 migration, so it cannot be sliced by month.

---

## 2. Data Sources & Definitions

| Table | Role in analysis |
|---|---|
| `public.user_watch_history` | Primary activity signal. One row per video watch/position update with `date`, `user_id`, `video_id`, and denormalized `l2`. |
| `public.youtube_videos` | Supplies `duration` (ISO-8601, e.g. `PT13M28S`) for estimated content-hours. |
| `public.user_saved_words` | Secondary "studied" signal — vocabulary saved per `l2` (`first_saved_at`). |
| `public.user_progress` | Cumulative progress records per `(user, l2)`; used only for learner counts, **not** time deltas. |
| `public.languages` | Name lookup for ISO codes. |

Definitions:

- **Watch event** — one row in `user_watch_history` (a recorded watch/position update, not a completed video and not a minute count).
- **Active user** — distinct `user_id` with at least one watch event in the window.
- **Unique videos** — distinct `video_id` in the window.
- **Est. content hours** — sum of full video durations for the events in the window. This is an **upper bound** on actual watch time (users rarely finish every video).
- **"Studied"** — for this analysis, primarily watching video content; vocabulary saving is reported separately.

---

## 3. Findings

### 3.1 Rolling 30 days (2026-07-10 → 2026-08-09 UTC)

| Rank | Language | Watch events | Active users | Unique videos | Est. content hours* |
|---:|---|---|---:|---:|---:|
| 1 | Chinese | 1,853 | 477 | 1,054 | ~630 |
| 2 | Japanese | 353 | 42 | 334 | ~58 |
| 3 | English | 138 | 33 | 134 | ~32 |
| 4 | Korean | 133 | 32 | 114 | ~20 |
| 5 | French | 86 | 28 | 80 | ~15 |
| 6 | German | 50 | 24 | 48 | ~10 |
| 7 | Spanish | 44 | 22 | 41 | ~8 |
| 8 | Vietnamese | 29 | 5 | 29 | ~10 |
| 9 | Russian | 28 | 13 | 28 | ~10 |
| 10 | Arabic | 24 | 8 | 22 | ~2 |

\* Sum of full video durations — upper bound, not actual watch time.

Chinese is ~64% of all watch events in the window, with 477 active learners vs. 42 for Japanese. The long tail includes Turkish, Yue Chinese, Czech, Croatian, Italian, Indonesian, Lithuanian, Thai, Hebrew, Klingon, Tagalog, Romanian, Dutch, and Danish (≤16 events each).

### 3.2 Calendar July 2026

| Rank | Language | Watch events | Active users |
|---:|---|---|---:|
| 1 | Chinese | 2,014 | 508 |
| 2 | Japanese | 445 | 44 |
| 3 | English | 142 | 38 |
| 4 | Korean | 117 | 37 |
| 5 | French | 109 | 36 |
| 6 | German | 72 | 20 |
| 7 | Spanish | 44 | 23 |
| 8 | Vietnamese | 33 | 5 |
| 9 | Russian | 32 | 16 |
| 10 | Turkish | 24 | 7 |

### 3.3 Annual (watch events / active users)

| Year | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **2024** | Chinese 36,161 / 4,378 | English 9,192 / 2,281 | (unknown) 4,774 / 2,049 | Japanese 3,824 / 825 | Spanish 3,243 / 564 |
| **2025** | Chinese 42,224 / 5,707 | English 4,810 / 1,003 | Korean 3,039 / 834 | Japanese 2,754 / 656 | (unknown) 2,161 / 1,420 |
| **2026 YTD** (through Aug 9) | Chinese 17,169 / 2,941 | English 1,587 / 394 | Japanese 1,406 / 260 | Korean 1,012 / 253 | French 927 / 188 |

Full 2024/2025/2026 top-10 detail:

| Year | Chinese | English | Japanese | Korean | French | German | Spanish | Russian | Italian | Other notable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2024 | 36,161 | 9,192 | 3,824 | 2,355 | 2,463 | 3,055 | 3,243 | 1,597 | 934 | Hindi 1,019; unknown 4,774 |
| 2025 | 42,224 | 4,810 | 2,754 | 3,039 | 1,622 | 1,862 | 1,757 | 1,212 | 538 | Finnish 677; unknown 2,161 |
| 2026 YTD | 17,169 | 1,587 | 1,406 | 1,012 | 927 | 745 | 830 | 402 | 213 | Indonesian 201; Vietnamese 159 |

### 3.4 Monthly trend — last 12 months (watch events)

Overall activity has declined from ~5,000 events/month (Sep–Oct 2025) to ~3,200–3,500/month (Apr–Jul 2026), while Chinese's share of the top-6 has stayed around 65–80%.

| Month | Chinese | English | Japanese | Korean | French | German | Spanish |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2025-09 | 2,819 | 253 | 215 | 183 | — | 134 | 231 |
| 2025-10 | 2,934 | 400 | 184 | 353 | — | — | 182 |
| 2025-11 | 2,923 | 247 | 192 | 212 | — | 116 | 108 |
| 2025-12 | 2,782 | 242 | 155 | 222 | — | 115 | 100 |
| 2026-01 | 2,660 | 197 | 230 | 143 | — | 145 | 117 |
| 2026-02 | 2,478 | 206 | 191 | 176 | 238 | — | 191 |
| 2026-03 | 2,434 | 187 | — | 135 | 138 | 115 | 168 |
| 2026-04 | 2,064 | 383 | 123 | 88 | 102 | — | 146 |
| 2026-05 | 2,574 | 226 | 83 | 94 | 89 | 80 | — |
| 2026-06 | 2,376 | 203 | 180 | 198 | 132 | 109 | — |
| 2026-07 | 2,014 | 142 | 445 | 117 | 109 | 72 | — |
| 2026-08 (partial) | 569 | 43 | 58 | 61 | 25 | 21 | — |

`—` = language did not make that month's top-6.

Total monthly events / active users (all languages):

| Month | Events | Active users |
|---|---:|---:|
| 2025-09 | 4,916 | 927 |
| 2025-10 | 5,035 | 1,031 |
| 2025-11 | 4,578 | 996 |
| 2025-12 | 4,365 | 916 |
| 2026-01 | 4,182 | 923 |
| 2026-02 | 4,124 | 842 |
| 2026-03 | 3,579 | 793 |
| 2026-04 | 3,334 | 753 |
| 2026-05 | 3,542 | 868 |
| 2026-06 | 3,512 | 800 |
| 2026-07 | 3,159 | 705 |
| 2026-08 (partial) | 868 | 225 |

### 3.5 Cumulative all-time (2023-10-02 → 2026-08-09)

204,676 watch events from 24,589 users.

| Rank | Language | Watch events | Active users | Unique videos |
|---:|---|---|---:|---:|
| 1 | Chinese | 106,780 | 12,086 | 11,269 |
| 2 | English | 18,797 | 4,202 | 4,009 |
| 3 | (unknown) | 13,965 | 4,468 | 5,791 |
| 4 | Japanese | 9,334 | 1,834 | 2,510 |
| 5 | Korean | 7,253 | 1,642 | 1,563 |
| 6 | German | 6,767 | 993 | 1,959 |
| 7 | Spanish | 6,588 | 1,181 | 1,696 |
| 8 | French | 5,948 | 1,137 | 1,657 |
| 9 | Russian | 3,920 | 599 | 1,200 |
| 10 | Italian | 2,061 | 427 | 901 |
| 11 | Hindi | 1,527 | 911 | 265 |
| 12 | Finnish | 1,461 | 85 | 963 |
| 13 | Arabic | 1,391 | 324 | 478 |
| 14 | Turkish | 1,265 | 192 | 595 |
| 15 | Portuguese | 988 | 210 | 538 |

### 3.6 Vocabulary & progress records

**Saved words, all-time** (rows / users):

| Language | Words saved | Users |
|---|---:|---:|
| Chinese | 361,289 | 3,809 |
| English | 26,209 | 759 |
| French | 18,847 | 189 |
| Japanese | 14,096 | 327 |
| German | 13,433 | 201 |
| Spanish | 9,731 | 204 |
| Russian | 8,798 | 120 |
| Korean | 7,093 | 206 |
| Turkish | 4,085 | 30 |
| Slovak | 3,338 | 5 |
| Italian | 3,014 | 65 |
| Dutch | 2,081 | 29 |
| Finnish | 1,801 | 18 |
| Indonesian | 1,702 | 23 |
| Portuguese | 1,396 | 28 |

**Progress rows, all-time** — distinct `(user, language)` progress records (not hours, see caveats):

| Language | Progress rows |
|---|---:|
| Chinese | 18,166 |
| English | 12,881 |
| Japanese | 3,441 |
| French | 2,605 |
| Korean | 2,506 |
| Spanish | 2,454 |
| German | 2,105 |
| Russian | 930 |
| Arabic | 709 |
| Italian | 651 |
| Hindi | 608 |
| Portuguese | 333 |
| Yue Chinese | 314 |
| Turkish | 255 |
| Persian | 193 |

---

## 4. Caveats & Data Quality

- **Watch events ≠ minutes watched.** A row is a recorded watch/position update. "Est. content hours" sums full video durations and is an upper bound.
- **`user_progress` cannot be sliced by time.** It is cumulative per `(user, l2)`, and `updated_at` was stamped during the 2026-08-04 migration backfill, so every row looks "recent." Its `time_ms`/`hours` values contain many capped/placeholder figures (e.g., exact 1,000,000-hour values) and were deliberately **not** used for time totals.
- **13,965 all-time rows (6.8%) have `l2 = NULL`**, mostly older records where the video-language join failed or the language was unknown. These are shown as "(unknown)".
- **Calendar-vs-rolling windows differ.** July 2026 is a fixed calendar month; the rolling 30-day window is Jul 10–Aug 9 and is the better "last month" read.
- **Migration coverage.** Watch history exists from Oct 2023 onward; any pre-2023 activity (Directus era before this table) is not included.
- **Vocabulary/progress tables** are cumulative snapshots, not event streams; "saved word" counts are by `first_saved_at`/row counts, not study sessions.

---

## 5. Reproducible SQL

All queries are read-only against the Supabase Postgres database (`SUPABASE_DB_URL` in `zerotohero-python-server/.env`).

Rolling 30-day top languages:

```sql
select wh.l2,
       coalesce(l.name, wh.l2) as lang_name,
       count(*) as watch_events,
       count(distinct wh.user_id) as active_users,
       count(distinct wh.video_id) as unique_videos
from public.user_watch_history wh
left join public.languages l
  on l."iso639-1" = wh.l2 or l."iso639-3" = wh.l2
where wh.date >= now() - interval '30 days'
group by wh.l2, coalesce(l.name, wh.l2)
order by watch_events desc;
```

Annual top languages:

```sql
select extract(year from date)::int as year,
       l2,
       count(*) as watch_events,
       count(distinct user_id) as active_users
from public.user_watch_history
group by 1, 2
order by 1, watch_events desc;
```

Monthly totals (last 12 months):

```sql
select to_char(date_trunc('month', date), 'YYYY-MM') as month,
       count(*) as watch_events,
       count(distinct user_id) as active_users
from public.user_watch_history
where date >= date_trunc('month', now()) - interval '11 months'
group by 1
order by 1;
```

All-time vocabulary saves by language:

```sql
select l2, count(*) as words_saved, count(distinct user_id) as users
from public.user_saved_words
group by l2
order by words_saved desc;
```

---

## 6. Future Improvements

- Add a real event log (or keep appending to `user_watch_history`) so "study time" can be derived from position deltas instead of full video durations.
- Backfill `l2` on the 13,965 NULL-language watch rows to eliminate the "(unknown)" bucket.
- If monthly analytics matter, snapshot these aggregates into a small `analytics_language_activity` table so historical windows don't depend on the full 200k-row scan.
- Consider treating `user_sync_log` (`entity='progress'`, `payload.l2`, `payload.time`) as the future source of incremental per-language study time — it is currently small (1,439 rows) and only covers recent syncs.
