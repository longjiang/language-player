# SPEC-040: Video Likes + Playlist Management

## Metadata
- **Spec ID**: SPEC-040
- **Feature**: Video likes, playlist management, and user-menu navigation
- **Status**: complete
- **Created**: 2026-08-04
- **ROADMAP Phase**: Phase 6: User Features

## Overview

The web app now lets users like videos from the watch page, save videos into
playlists, manage those playlists, and browse all liked videos. The account
navigation was also consolidated: Watch History, Playlists, Liked Videos, and
Saved Words moved from the main header menus into the UserMenu.

## User Stories

- As a learner, I want to like a video from the player controls so I can find it again later.
- As a learner, I want to save a video into a playlist (existing or new) while watching it.
- As a learner, I want a playlists page where I can create, rename, delete, and open playlists.
- As a learner, I want a playlist detail page where I can play or remove videos.
- As a learner, I want a liked-videos page so I can quickly resume videos I enjoyed.
- As a learner, I want account-specific pages under the profile menu instead of mixed into the content navigation.

## How It Works in Classic (Nuxt)

- `zerotohero-nuxt/store/userLikes.js` — GET `/likes`, PUT `/likes`, DELETE `/likes/<l2>/<video_id>`.
- `zerotohero-nuxt/store/playlists.js` — GET/POST `/playlists`, PUT/DELETE `/playlists/<id>`.
- `zerotohero-nuxt/components/AddToPlaylist.vue` — checkbox dialog for existing playlists plus a "New Playlist" option.
- `zerotohero-nuxt/pages/_l1/_l2/my-playlists.vue`, `.../playlist/_id.vue`, `.../youtube/likes.vue` — playlist and liked-video pages.

## Implementation (Next.js)

### Route

- `/[l1]/[l2]/playlists` — playlist management list.
- `/[l1]/[l2]/playlists/[playlistId]` — playlist detail (play/remove/rename/delete).
- `/[l1]/[l2]/liked-videos` — liked video list.

### Data Flow

1. `UserLibraryProvider` hydrates likes and playlists once per authenticated user + L2 from the Flask row APIs.
2. The watch page reads `isLiked`/`toggleLike` and opens `AddToPlaylistDialog`.
3. Mutations are optimistic; failures are logged and state is rolled back where applicable.

### Components

- `providers/user-library-provider.tsx` — shared likes/playlists state and mutation API.
- `components/video/add-to-playlist-dialog.tsx` — save a video into existing playlists and/or a new playlist.
- `components/video/video-control-bar.tsx` / `subtitles-mode-band.tsx` — heart + bookmark actions.
- `components/layout/user-menu.tsx` — account navigation links.

### API Endpoints

- `GET /likes`, `PUT /likes`, `DELETE /likes/<l2>/<video_id>`
- `GET /playlists`, `GET /playlists/<id>`, `POST /playlists`, `PUT /playlists/<id>`, `DELETE /playlists/<id>`

### States

- **Loading**: spinner while likes/playlists hydrate.
- **Empty**: dashed empty states for no playlists, empty playlist, and no liked videos.
- **Unauthenticated**: sign-in prompt on each account page.
- **Edge cases**: videos without a database `id` cannot be liked (the heart is disabled); videos without an `id` can still be added to playlists by `youtube_id`.

## Dependencies

- SPEC-039 5.3 row APIs for `/likes` and `/playlists`.
- Shared types in `packages/shared` (`LikedVideo`, `Playlist`, `PlaylistVideo`).

## Open Questions

None.
