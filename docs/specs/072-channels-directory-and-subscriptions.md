# SPEC-072: Channels Directory + Subscribed-Content Feed (web + mobile)

## Metadata

- **Spec ID**: SPEC-072
- **Feature**: Port Classic's channel directory (`/youtube/channels`) and
  subscribed-content feed (`/youtube/subscriptions`) to `apps/web` and
  `apps/mobile`
- **Status**: draft
- **Created**: 2026-08-12
- **ROADMAP Phase**: Phase 5 — Content Features
- **See also**: [SPEC-071 — Classic Route Redirect Adapter](071-classic-route-redirect-adapter.md) · [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md)

## 1. Overview

Classic has a channel directory and a "Subscribed Channels Content" feed.
Per-channel subscribe / not-interested state already exists in both apps
(`useChannelPreference` → Flask `/channel-preferences`), but neither app has
the two aggregate pages. This spec ports both pages, adds them to navigation,
and adds a "My Activity" section to the mobile profile with a reset action for
channels marked "not interested".

## 2. Routes

| App | Channel directory | Subscribed-content feed |
|---|---|---|
| Web | `/{l1}/{l2}/channels` | `/{l1}/{l2}/my-channels` |
| Mobile | `(tabs)/(media)/channels` | `(tabs)/(media)/my-channels` |

## 3. API

No new backend endpoints are required. Existing Flask endpoints are reused:

| Purpose | Endpoint |
|---|---|
| Channel list | `GET /channels?l2=<code>` |
| Videos from subscribed channels | `GET /search-videos?l2=<code>&channelIds=a,b,c&limit=100&sort=-date` |
| Channel preferences | `GET/PUT /channel-preferences` |

Web adds two thin Next.js proxies so pages keep using `/api/...`:

- `GET /api/channels?l2=...` → Flask `/channels`
- `GET /api/videos/subscribed?l2=...&channelIds=...` → Flask `/search-videos`

Mobile calls Flask directly through `apiClient` (same as the existing channel
page). Bulk reset ("unsubscribe all" / "unmark all") is implemented client-side
as one `PUT /channel-preferences` per channel with `status: 'neutral'`; there
is no bulk endpoint.

## 4. Web UI

### 4.1 Channel directory (`/channels`)

- Page title: "{l2} YouTube Channels" (`msg.channels_for_l2`)
- Responsive grid of channel cards (thumbnail, title, subscriber/video counts,
  link to `/channel/{channelId}`, `ChannelActionsMenu`)
- Data from `/api/channels?l2=...`

### 4.2 Subscribed-content feed (`/my-channels`)

- Page title: "My Channels" (`title.my_channels`)
- Video grid from `/api/videos/subscribed?channelIds=...`
- Sidebar (same `Sidebar` component used by dictionary/reader) with two tabs:
  - **Subscribed**: channel cards of subscribed channels; count on top; "..."
    menu with "Unsubscribe from all"
  - **Not Interested**: channel cards of marked channels; "..." menu with
    "Unmark all as Not Interested"
- Resetting a tab clears preferences and refetches both the feed and the
  sidebar lists

### 4.3 Navigation

- Header → Media group: add `Channels` → `/channels`
- Header → User menu: add `My Channels` → `/my-channels`

### 4.4 Profile

- Add a "Reset channels marked not interested" button in the settings card
  (same action as the sidebar bulk reset)

## 5. Mobile UI

### 5.1 Channel directory (`(tabs)/(media)/channels`)

Same content as web, in a `PageContainer` + `ScrollView`: title, responsive
grid of channel cards, each linking to the existing channel screen.

### 5.2 Subscribed-content feed (`(tabs)/(media)/my-channels`)

- Page title: "My Channels"
- Video grid (existing `VideoGrid`)
- Tab bar (existing `ui/tabs`) instead of a sidebar, with the same two tabs:
  Subscribed / Not Interested, each listing channel cards + bulk action

### 5.3 Navigation

- Hamburger drawer → Media group: add `Channels`
- User menu: add `My Channels`

### 5.4 Profile ("My Activity")

- Remove the inline **Watch History** and **Saved Words** sections
- Add a **My Activity** section with buttons:
  - Watch History → `(tabs)/(media)/watch-history`
  - Playlists → `(tabs)/(me)/playlists`
  - Liked Videos → `(tabs)/(me)/liked-videos`
  - Saved Words → `(tabs)/(vocab)/saved-words`
  - Reset channels marked not interested

## 6. Data Flow

1. Channel directory loads `/channels` for the current L2 and renders cards.
2. My Channels loads `/channel-preferences` for the current user + L2 and
   splits into `subscribed` / `not_interested` channel id lists.
3. The feed requests `/search-videos` with the subscribed ids, newest first.
4. Bulk reset loops `PUT /channel-preferences` with `status: 'neutral'`,
   then refetches preferences and the feed.

## 7. i18n

New translation keys (added through `translations.csv` workflow, all 31
locales):

- `title.channels`
- `title.my_channels`
- `title.subscribed`
- `title.not_interested`
- `title.my_activity`
- `action.unsubscribe_all`
- `action.unmark_all_not_interested`
- `action.reset_not_interested`
- `msg.channels_for_l2`
- `msg.no_subscribed_channels`
- `msg.no_not_interested_channels`

Existing keys are reused for Subscribe/Unsubscribe/Not Interested, watch
history, playlists, liked videos, and saved words.

## 8. Testing

- Web: typecheck, lint, existing Vitest suite, build check
- Web route matcher: add `channels` / `my-channels` to `WEB_ROUTE_PATTERNS`
  so the adapter never redirects them
- Mobile: typecheck (`cd apps/mobile && ./node_modules/.bin/tsc --noEmit`)
- Manual: directory loads per L2; subscribing/unsubscribing in one tab updates
  the feed and sidebar; bulk actions reset both lists

## 9. Out of Scope / Deferred

- Watch-page queue hydration from `?queueType=` (SPEC-071 §8.3, deferred)
- Channel preferences sync beyond the existing `channel-preferences` API
- Classic `/youtube/channels` and `/youtube/subscriptions` redirect behavior
  stays in place until these pages are live
