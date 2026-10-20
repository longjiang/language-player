/**
 * Shapes returned by the content-management Flask routes (SPEC-099):
 * `/admin/videos*`, `/admin/channels/*`, `/admin/playlists/add`,
 * `/admin/tv-shows`, `/admin/talks`, and the public `/tv-shows`, `/talks`,
 * `/channels` readers the console lists from.
 */

/** `youtube_videos` row as `/admin/videos` returns it (`_admin_video_dict`). */
export interface AdminVideo {
  id: number;
  status: string | null;
  owner: string | number | null;
  created_on: string | null;
  youtube_id: string | null;
  title: string | null;
  topic: string | null;
  level: string | number | null;
  subs_l2: string | null;
  lesson: string | number | null;
  channel_id: string | null;
  date: string | null;
  notes: string | null;
  /** Legacy Directus numeric language id — never send it back as a code. */
  l2: number | string | null;
  tv_show: { id: number; title: string } | null;
  talk: { id: number; title: string } | null;
  lex_div: number | null;
  views: number | null;
  tags: string | null;
  made_for_kids: number | null;
  category: string | number | null;
  likes: number | null;
  comments: number | null;
  locale: string | null;
  duration: string | null;
  word_freq: number | null;
  difficulty: number | null;
  type: string | null;
}

/**
 * The writable subset of a video — `utils_content.ADMIN_VIDEO_WRITABLE`.
 * Unknown keys are silently dropped by Flask, so this list is the contract.
 */
export interface VideoInput {
  youtube_id?: string;
  title?: string | null;
  topic?: string | null;
  level?: string | number | null;
  l2?: string;
  subs_l2?: string | null;
  lesson?: string | number | null;
  channel_id?: string | null;
  date?: string | null;
  notes?: string | null;
  /** A show id, a title (matched/created in this language), or null to unassign. */
  tv_show?: number | string | null;
  /** A talk id, a title (matched/created in this language), or null to unassign. */
  talk?: number | string | null;
  lex_div?: number | null;
  views?: number | null;
  tags?: string | null;
  made_for_kids?: number | boolean | null;
  category?: string | number | null;
  likes?: number | null;
  comments?: number | null;
  locale?: string | null;
  duration?: string | null;
  word_freq?: number | null;
  difficulty?: number | null;
  type?: string | null;
  status?: string | null;
}

/** A `tv_shows` / `talks` row (`utils_content._show_dict`). */
export interface AdminShow {
  id: number;
  status: string | null;
  created_on: string | null;
  youtube_id: string | null;
  l2: number | string | null;
  /** Present on the public listing (the ISO code); absent on write responses. */
  l2Code?: string | null;
  title: string | null;
  channel_id: string | null;
  year: number | null;
  avg_views: number | null;
  hidden: number | null;
  tags: string | null;
  category: string | number | null;
  locale: string | null;
  made_for_kids: number | null;
  lex_div: number | null;
  audiobook?: number | null;
}

/** `utils_content._SHOW_WRITABLE_BY_TABLE`. */
export interface ShowInput {
  title?: string;
  youtube_id?: string | null;
  channel_id?: string | null;
  year?: number | null;
  l2?: string;
  hidden?: number | boolean;
  audiobook?: number | boolean;
  tags?: string | null;
  made_for_kids?: number | boolean;
  lex_div?: number | null;
  avg_views?: number | null;
  category?: string | number | null;
  locale?: string | null;
  status?: string | null;
}

export type ShowKind = 'tv_shows' | 'talks';

/** A `youtube_channels` row (`utils_content._channel_dict`). */
export interface AdminChannel {
  id: number;
  channel_id: string;
  thumbnail: string | null;
  title: string | null;
  subscribers: string | number | null;
  video_count: string | number | null;
  l2: number | string | null;
  l2Code: string | null;
  description: string | null;
  custom_url: string | null;
  country: string | null;
  views: number | null;
}

/**
 * `GET /admin/channels/<channel_id>?l2=` — one stored channel plus the number
 * of `youtube_videos` rows the delete would remove. `stored_video_count` is
 * not the channel's YouTube `video_count`.
 */
export interface AdminChannelDetail {
  channel: AdminChannel;
  stored_video_count: number;
}

/** `GET /admin/channels/resolve` — live YouTube channel metadata. */
export interface ResolvedChannel {
  channel_id: string;
  title: string | null;
  handle: string | null;
  description: string | null;
  country: string | null;
  published_at: string | null;
  thumbnail: string | null;
  uploads_playlist_id: string | null;
  subscribers: string | number | null;
  video_count: string | number | null;
}

/** One video of a channel (`GET /channels/<id>/videos`). */
export interface ChannelVideo {
  youtube_id: string;
  id: string;
  title: string | null;
  duration: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  locale: string | null;
  date: string | null;
  category: string | number | null;
  tags: string | null;
  channel_id: string | null;
}

/** A public video row — `get_videos_in_show` (`_video_dict`). */
export interface EpisodeVideo {
  id: number;
  youtube_id: string | null;
  title: string | null;
  l2: number | string | null;
  difficulty: number | null;
  lex_div: number | null;
  word_freq: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  duration: string | null;
  locale: string | null;
  tv_show: number | null;
  talk: number | null;
  date: string | null;
  tags: string | null;
  category: string | number | null;
  made_for_kids: number | null;
  channel_id: string | null;
  type: string | null;
  notes: string | null;
}

// ── Ingestion (SPEC-096) ────────────────────────────────────────────────

export interface ImportCursor {
  offset?: number;
  page_token?: string;
  skip?: number;
}

export interface ImportVideoResult {
  youtube_id: string;
  status: 'added' | 'updated' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
  error_kind?: string;
  id?: number | null;
  title?: string;
  lines?: number;
  lex_div?: number;
  word_freq?: number;
  difficulty?: number;
  fields?: string[];
  show?: { kind: string; id: number | null };
}

export interface ImportSummary {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  requested?: number;
  invalid?: number;
  caption_service_unavailable?: number;
  transcript_too_short?: number;
}

export interface ImportResponse {
  results: ImportVideoResult[];
  summary: ImportSummary;
  next_cursor: ImportCursor | null;
  l2: string;
  channel?: ResolvedChannel;
  playlist_id?: string;
  circuit_broken?: boolean;
  show?: { kind: string; table: string; id: number | null; title: string };
  show_stats?: AdminShow | null;
}

/** The body shared by every ingestion call. */
export interface ImportOptions {
  l2: string;
  force?: boolean;
  clean_generated?: boolean;
  refresh_existing?: boolean;
  talk?: string;
  tv_show?: string;
  limit?: number;
  match_keywords?: string;
  use_circuit_break?: boolean;
  cursor?: ImportCursor | null;
}

// ── Discovery (SPEC-098) ────────────────────────────────────────────────

export interface DiscoverCandidate {
  youtube_id: string;
  id?: number | null;
  title: string;
  channel_id: string | null;
  views: number | null;
  term: string;
}

export interface DiscoverResponse {
  l2: string;
  terms?: string[];
  scraped: number;
  candidates: DiscoverCandidate[];
  skipped: Record<string, string[]>;
  imported_candidates?: string[];
  import?: ImportResponse;
}

// ── Preflight (SPEC-099) ────────────────────────────────────────────────

/** Metadata-only verdicts from `video_import_block_reason()`. */
export type PreflightBlockReason =
  | 'unavailable'
  | 'not_embeddable'
  | 'region_restricted'
  | 'locale_mismatch';

export interface PreflightRow {
  youtube_id: string;
  title: string | null;
  /** `snippet.defaultAudioLanguage` — absent on many uploads. */
  declared_locale: string | null;
  /** `null` when YouTube returned no video, so "no verdict" ≠ compatible. */
  matches_l2: boolean | null;
  block_reason: PreflightBlockReason | null;
}

export interface PreflightSummary {
  total: number;
  mismatched: number;
  unavailable: number;
  not_embeddable: number;
  region_restricted: number;
  invalid: number;
}

export interface PreflightResponse {
  l2: string;
  /** Every locale the importer accepts for this L2 (`utils_youtube.l2_locales`). */
  l2_locales: string[];
  results: PreflightRow[];
  invalid: string[];
  summary: PreflightSummary;
}

// ── Discovery screening (SPEC-096 / SPEC-099) ───────────────────────────

/**
 * `found` — a track in the L2 locale family exists (no download yet);
 * `stored` — the video is already in the DB and has `subs_l2` stored;
 * `not_checked` — skipped (unavailable, non-embeddable, check disabled, or
 * the caption service blocked a previous listing in the same batch).
 */
export type TranscriptStatus =
  | 'found'
  | 'no_transcript'
  | 'caption_service_unavailable'
  | 'stored'
  | 'not_checked';

export interface ScreeningTranscript {
  language_code: string | null;
  language: string | null;
  /** True for YouTube ASR, false for a manually created track. */
  is_generated: boolean;
}

/** One row of `POST /admin/videos/screen` — the discovery table's record. */
export interface ScreeningRow {
  youtube_id: string;
  in_db: boolean;
  db_video_id: number | null;
  title: string | null;
  channel_id: string | null;
  channel_title: string | null;
  thumbnail: string | null;
  /** Raw ISO-8601 (`PT3M44S`), as stored in `youtube_videos.duration`. */
  duration: string | null;
  /** `snippet.defaultAudioLanguage` (or `defaultLanguage`), when declared. */
  declared_audio_locale: string | null;
  /** `null` when YouTube returned no video or the stored row has no locale. */
  audio_matches_l2: boolean | null;
  available: boolean;
  /** `null` when the id was unavailable, so embeddability is unknown. */
  embeddable: boolean | null;
  region_restricted: boolean;
  /** The raw `video_import_block_reason()` verdict (force not applied). */
  block_reason: PreflightBlockReason | null;
  transcript: ScreeningTranscript | null;
  transcript_status: TranscriptStatus;
  transcript_error: string | null;
  views: number | null;
}

export interface ScreeningSummary {
  requested: number;
  invalid: number;
  in_db: number;
  checked_metadata: number;
  unavailable: number;
  not_embeddable: number;
  region_restricted: number;
  locale_mismatch: number;
  transcript_found: number;
  no_transcript: number;
  caption_service_unavailable: number;
  not_checked: number;
  /** New rows the importer would accept with the current force setting. */
  eligible: number;
}

export interface CaptionError {
  kind: string;
  message: string;
}

export interface ScreeningResponse {
  l2: string;
  l2_locales: string[];
  results: ScreeningRow[];
  invalid: string[];
  /** Set when the caption listing itself failed; listings stop at that row. */
  caption_error: CaptionError | null;
  summary: ScreeningSummary;
}

/** `POST /admin/videos/ids` — one page of candidate ids, never imports. */
export interface VideoIdsResponse {
  l2: string;
  youtube_ids: string[];
  next_cursor: ImportCursor | null;
  invalid: string[];
  /** Present when a channel reference was resolved. */
  channel: ResolvedChannel | null;
  playlist_id: string | null;
}

// ── Sweep ───────────────────────────────────────────────────────────────

/** The sweep's keyset cursor is its own shape, not the importer's. */
export interface SweepCursor {
  after_id: number;
}

export interface SweepRow {
  youtube_id: string;
  id: number | null;
}

export interface SweepResponse {
  checked: number;
  unavailable: SweepRow[];
  deleted: SweepRow[];
  invalid?: string[];
  next_cursor: SweepCursor | null;
  l2: string;
}
