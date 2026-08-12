# ADR-0036 — Channel avatars fetched live via `/channel-thumbnail`

**Status:** Accepted (2026-08-12)

## Context

The `youtube_channels.thumbnail` column stores a snapshot of each channel's
avatar at ingestion time. Channel branding changes frequently, so those
snapshots go stale — and in practice most stored avatars are now broken.

Classic never uses the DB thumbnail for the channel card avatar. Its
`ChannelCard.vue` loads `${PYTHON_SERVER}channel-thumbnail?channel_id=...`
instead. Flask's `/channel-thumbnail` endpoint:

1. checks a server-side byte cache for the channel id,
2. on a miss, fetches the current avatar from the YouTube Data API
   (high → medium → default resolution),
3. stores the bytes in the cache, and
4. serves the image directly, falling back to a placeholder on client error.

The new web/mobile channel cards initially used the DB `thumbnail` directly,
which reproduced the stale-avatar problem (SPEC-072).

## Decision

**Web and mobile channel cards use the live `/channel-thumbnail` endpoint for
avatars**, matching Classic. The DB `thumbnail` column is retained as channel
metadata but is not the primary avatar source. On image load failure, the card
falls back to the YouTube favicon (web) / the same fallback pattern (mobile).

Rationale:

- Avatars are frequently updated by channel owners; the DB snapshot is not a
  reliable source of truth.
- The Flask endpoint already exists, is cached server-side, and is what
  Classic uses — no new backend work is required.
- The endpoint serves image bytes directly, so clients do not need YouTube
  API access or a second round-trip to `/channel-info`.

## Consequences

- Each channel avatar is fetched from YouTube at most once per cache entry,
  then served from the server-side cache — bounded YouTube API cost.
- The current cache is keyed by channel id with no explicit TTL, so a channel
  rebrand can still show the previously cached avatar until the cache is
  cleared. A TTL or versioned cache key is a possible follow-up if freshness
  matters more than API cost.
- If `/channel-thumbnail` is down or the channel no longer exists, the card
  falls back to a placeholder/favicon rather than a broken image.

## References

- SPEC-072 — Channels Directory + Subscribed-Content Feed
- `zerotohero-nuxt/components/ChannelCard.vue` — Classic's avatar source
- `zerotohero-python-server/routes/video.py` — `/channel-thumbnail` endpoint
- `zerotohero-python-server/utils_youtube.py` — `get_channel_avatar_bytes`
