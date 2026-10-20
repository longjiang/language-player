/**
 * Typed clients for the content-management routes (SPEC-099).
 *
 * Everything here goes through `authenticatedFetch`, which attaches the
 * Supabase access token mirrored by `SessionTokenMirror`; the Flask
 * `admin_bp` blueprint rejects anything without a verified
 * `app_metadata.is_admin` claim.
 */

import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { log, logerr } from '@/lib/logger';
import type {
  AdminChannel,
  AdminChannelDetail,
  AdminShow,
  AdminVideo,
  ChannelVideo,
  DiscoverResponse,
  EpisodeVideo,
  ImportCursor,
  ImportOptions,
  ImportResponse,
  ImportVideoResult,
  PreflightResponse,
  PreflightRow,
  PreflightSummary,
  ResolvedChannel,
  ScreeningResponse,
  ShowInput,
  TranscriptCheckResponse,
  ShowKind,
  SweepCursor,
  SweepResponse,
  VideoIdsResponse,
  VideoInput,
} from '@/types/content';

// ── Plumbing ────────────────────────────────────────────────────────────

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** A `subs_l2` CSV can be megabytes — never log it whole. */
function redact(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && value.length > 120) {
      out[key] = `<string:${value.length}>`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  body?: Record<string, unknown>,
): Promise<T> {
  log('content-api request', { method: init.method ?? 'GET', path, body: body ? redact(body) : undefined });
  const res = await authenticatedFetch(`${PYTHON_API_URL}${path}`, init);
  if (!res.ok) {
    const message = await readError(res);
    logerr('content-api failed', { path, status: res.status, message });
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ── Videos (`/admin/videos`) ────────────────────────────────────────────

export interface VideoListParams {
  l2?: string | null;
  /** SPEC-099: case-insensitive title search. */
  q?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
  tv_show?: number | null;
  talk?: number | null;
  tvShowNotNull?: boolean;
  talkNotNull?: boolean;
}

export async function listVideos(params: VideoListParams): Promise<AdminVideo[]> {
  const data = await request<{ data: AdminVideo[] }>(
    `/admin/videos${query({
      l2: params.l2,
      q: params.q,
      sort: params.sort ?? '-id',
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
      tv_show: params.tv_show,
      talk: params.talk,
      'filter[tv_show][nnull]': params.tvShowNotNull ? 1 : undefined,
      'filter[talk][nnull]': params.talkNotNull ? 1 : undefined,
    })}`,
  );
  return data.data ?? [];
}

export async function createVideo(input: VideoInput): Promise<number> {
  const data = await request<{ id: number }>(
    '/admin/videos',
    jsonInit('POST', input as Record<string, unknown>),
    input as Record<string, unknown>,
  );
  return data.id;
}

export async function updateVideo(id: number, input: VideoInput): Promise<AdminVideo> {
  const data = await request<{ video: AdminVideo }>(
    `/admin/videos/${id}`,
    jsonInit('PATCH', input as Record<string, unknown>),
    input as Record<string, unknown>,
  );
  return data.video;
}

export async function deleteVideo(id: number): Promise<void> {
  await request<void>(`/admin/videos/${id}`, { method: 'DELETE' });
}

// ── Ingestion (SPEC-096) ────────────────────────────────────────────────

export interface SingleImportOptions extends Omit<ImportOptions, 'l2' | 'cursor'> {
  l2: string;
  youtube_id: string;
}

/** `POST /admin/videos/add` answers with one per-video result, not a page. */
export type SingleImportResult = ImportVideoResult & { l2: string };

export async function importSingle(input: SingleImportOptions): Promise<SingleImportResult> {
  const response = await request<SingleImportResult>(
    '/admin/videos/add',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api import single', {
    youtube_id: input.youtube_id,
    status: response.status,
    reason: response.reason,
  });
  return response;
}

export interface BatchImportOptions extends ImportOptions {
  youtube_ids: string[] | string;
}

export async function importBatch(input: BatchImportOptions): Promise<ImportResponse> {
  const response = await request<ImportResponse>(
    '/admin/videos/add-batch',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api import page', {
    endpoint: 'add-batch',
    summary: response.summary,
    next_cursor: response.next_cursor,
  });
  return response;
}

export async function resolveChannel(reference: string): Promise<ResolvedChannel> {
  const data = await request<{ channel: ResolvedChannel }>(
    `/admin/channels/resolve?channel=${encodeURIComponent(reference)}`,
  );
  return data.channel;
}

export interface ChannelImportOptions extends ImportOptions {
  channel: string;
}

export async function importChannel(input: ChannelImportOptions): Promise<ImportResponse> {
  const response = await request<ImportResponse>(
    '/admin/channels/add',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api import page', {
    endpoint: 'channels/add',
    summary: response.summary,
    next_cursor: response.next_cursor,
    circuit_broken: response.circuit_broken,
  });
  return response;
}

export interface PlaylistImportOptions extends ImportOptions {
  playlist: string;
}

export async function importPlaylist(input: PlaylistImportOptions): Promise<ImportResponse> {
  const response = await request<ImportResponse>(
    '/admin/playlists/add',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api import page', {
    endpoint: 'playlists/add',
    summary: response.summary,
    next_cursor: response.next_cursor,
  });
  return response;
}

// ── Discovery (SPEC-098) ────────────────────────────────────────────────

export interface DiscoverOptions {
  l2: string;
  terms?: string;
  term_limit?: number;
  pages?: number;
  max_per_channel?: number;
  import?: boolean;
  limit?: number;
  talk?: string;
  force?: boolean;
  clean_generated?: boolean;
  refresh_existing?: boolean;
}

export async function discover(input: DiscoverOptions): Promise<DiscoverResponse> {
  const response = await request<DiscoverResponse>(
    '/admin/videos/discover',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api discover', {
    l2: input.l2,
    import: !!input.import,
    scraped: response.scraped,
    candidates: response.candidates?.length ?? 0,
    skipped: Object.fromEntries(
      Object.entries(response.skipped ?? {}).map(([k, v]) => [k, v?.length ?? 0]),
    ),
  });
  return response;
}

// ── Discovery screening (SPEC-096 / SPEC-099) ───────────────────────────

export interface VideoIdsOptions {
  l2: string;
  youtube_ids?: string[] | string;
  channel?: string;
  playlist?: string;
  cursor?: ImportCursor | null;
  limit?: number;
  match_keywords?: string;
}

/**
 * Enumerate candidate ids without importing them. One call returns one
 * playlist page (max 50) or one slice of a pasted list; call again with
 * `next_cursor` while it is non-null.
 */
export async function listVideoIds(input: VideoIdsOptions): Promise<VideoIdsResponse> {
  const response = await request<VideoIdsResponse>(
    '/admin/videos/ids',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api list ids', {
    source: input.channel ? 'channel' : input.playlist ? 'playlist' : 'ids',
    ids: response.youtube_ids?.length ?? 0,
    next_cursor: response.next_cursor,
    invalid: response.invalid?.length ?? 0,
  });
  return response;
}

export interface ScreenOptions {
  l2: string;
  youtube_ids: string[];
  check_transcripts?: boolean;
}

/**
 * Screen up to 50 ids: stored-row verdicts from the DB, YouTube metadata in
 * one batched call, then the L2 caption-track listing. No transcript is
 * downloaded and nothing is written; this is the discovery phase only.
 */
export async function screenVideos(input: ScreenOptions): Promise<ScreeningResponse> {
  const response = await request<ScreeningResponse>(
    '/admin/videos/screen',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api screen', {
    l2: input.l2,
    requested: input.youtube_ids.length,
    in_db: response.summary?.in_db,
    eligible: response.summary?.eligible,
    caption_error: response.caption_error,
  });
  return response;
}

export interface TranscriptCheckOptions {
  l2: string;
  youtube_ids: string[];
}

/**
 * List caption tracks only — no metadata, no DB, no transcript download.
 * This is the Check phase; the console sends one id per call so the table can
 * show a spinner against exactly one video.
 */
export async function checkTranscripts(
  input: TranscriptCheckOptions,
): Promise<TranscriptCheckResponse> {
  const response = await request<TranscriptCheckResponse>(
    '/admin/videos/transcripts',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api transcript check', {
    l2: input.l2,
    requested: input.youtube_ids.length,
    status: response.results?.[0]?.transcript_status,
    caption_error: response.caption_error,
  });
  return response;
}

// ── Preflight (SPEC-099) ────────────────────────────────────────────────

const PREFLIGHT_BATCH = 50;

function emptyPreflightSummary(): PreflightSummary {
  return { total: 0, mismatched: 0, unavailable: 0, not_embeddable: 0, region_restricted: 0, invalid: 0 };
}

/**
 * Ask the backend what the importer would decide about these ids *without
 * importing them* — the admin console's language-mismatch warning.
 *
 * The rule (`video_import_block_reason` + `l2_locales`) lives server-side on
 * purpose: re-implementing it here would produce false mismatches for real
 * locale variants (`zh-Hant` under `zh`, `pt-BR` under `pt`, `nb` under `no`).
 * Ids are chunked at the YouTube API's 50-per-request limit.
 */
export async function preflightVideos(
  l2: string,
  youtubeIds: string[],
): Promise<PreflightResponse> {
  const unique = [...new Set(youtubeIds.filter(Boolean))];
  let l2_locales: string[] = [];
  const results: PreflightRow[] = [];
  const invalid: string[] = [];
  const summary = emptyPreflightSummary();

  for (let start = 0; start < unique.length; start += PREFLIGHT_BATCH) {
    const slice = unique.slice(start, start + PREFLIGHT_BATCH);
    const response = await request<PreflightResponse>(
      '/admin/videos/preflight',
      jsonInit('POST', { l2, youtube_ids: slice }),
      { l2, youtube_ids: slice },
    );
    l2_locales = response.l2_locales ?? l2_locales;
    results.push(...(response.results ?? []));
    invalid.push(...(response.invalid ?? []));
    for (const key of Object.keys(summary) as (keyof PreflightSummary)[]) {
      summary[key] += response.summary?.[key] ?? 0;
    }
  }

  log('content-api preflight', {
    l2,
    checked: results.length,
    mismatched: summary.mismatched,
    unavailable: summary.unavailable,
    invalid: invalid.length,
  });
  return { l2, l2_locales, results, invalid, summary };
}

/** Fold a later preflight page into the accumulated one. */
export function mergePreflight(
  previous: PreflightResponse | null,
  next: PreflightResponse,
): PreflightResponse {
  if (!previous) return next;
  const summary = { ...previous.summary };
  for (const key of Object.keys(summary) as (keyof PreflightSummary)[]) {
    summary[key] += next.summary?.[key] ?? 0;
  }
  return {
    l2: next.l2 || previous.l2,
    l2_locales: next.l2_locales?.length ? next.l2_locales : previous.l2_locales,
    results: [...previous.results, ...next.results],
    invalid: [...previous.invalid, ...next.invalid],
    summary,
  };
}

/** Rows whose declared language is outside the target's locales. */
export function languageMismatches(response: PreflightResponse | null): PreflightRow[] {
  return (response?.results ?? []).filter((row) => row.block_reason === 'locale_mismatch');
}

// ── Unavailable sweep ───────────────────────────────────────────────────

export interface SweepOptions {
  l2: string;
  youtube_ids?: string[];
  cursor?: SweepCursor | null;
  limit?: number;
  delete?: boolean;
}

export async function sweepUnavailable(input: SweepOptions): Promise<SweepResponse> {
  const response = await request<SweepResponse>(
    '/admin/videos/sweep-unavailable',
    jsonInit('POST', input as unknown as Record<string, unknown>),
    input as unknown as Record<string, unknown>,
  );
  log('content-api sweep', {
    l2: input.l2,
    delete: !!input.delete,
    checked: response.checked,
    unavailable: response.unavailable?.length ?? 0,
    deleted: response.deleted?.length ?? 0,
    next_cursor: response.next_cursor,
  });
  return response;
}

// ── Shows & talks ───────────────────────────────────────────────────────

function showPath(kind: ShowKind, id?: number): string {
  const base = kind === 'tv_shows' ? '/tv-shows' : '/talks';
  return id === undefined ? base : `${base}/${id}`;
}

export async function listShows(
  kind: ShowKind,
  opts: { l2?: string | null; includeHidden?: boolean; limit?: number } = {},
): Promise<AdminShow[]> {
  return request<AdminShow[]>(
    `${showPath(kind)}${query({
      l2: opts.l2,
      includeHidden: opts.includeHidden ? 1 : undefined,
      limit: opts.limit ?? 1000,
    })}`,
  );
}

export async function createShow(kind: ShowKind, input: ShowInput): Promise<AdminShow> {
  const data = await request<{ show: AdminShow }>(
    `/admin${showPath(kind)}`,
    jsonInit('POST', input as Record<string, unknown>),
    input as Record<string, unknown>,
  );
  return data.show;
}

export async function updateShow(
  kind: ShowKind,
  id: number,
  input: ShowInput,
): Promise<AdminShow> {
  const data = await request<{ show: AdminShow }>(
    `/admin${showPath(kind, id)}`,
    jsonInit('PATCH', input as Record<string, unknown>),
    input as Record<string, unknown>,
  );
  return data.show;
}

export async function deleteShow(kind: ShowKind, id: number): Promise<void> {
  await request<void>(`/admin${showPath(kind, id)}`, { method: 'DELETE' });
}

export async function listEpisodes(
  kind: ShowKind,
  id: number,
  l2?: string | null,
): Promise<EpisodeVideo[]> {
  return request<EpisodeVideo[]>(
    `${showPath(kind, id)}/episodes${query({ l2, limit: 100 })}`,
  );
}

// ── Channels (detail + import + delete) ─────────────────────────────────

export async function listChannels(l2: string): Promise<AdminChannel[]> {
  return request<AdminChannel[]>(`/channels?l2=${encodeURIComponent(l2)}`);
}

/** Stored channel row plus the count of videos the delete would remove. */
export async function getChannel(
  channelId: string,
  l2: string,
): Promise<AdminChannelDetail> {
  return request<AdminChannelDetail>(
    `/admin/channels/${encodeURIComponent(channelId)}${query({ l2 })}`,
  );
}

/** Delete one language's channel row and every video stored under it. */
export async function deleteChannel(
  channelId: string,
  l2: string,
): Promise<{ deleted_videos: number }> {
  const result = await request<{ deleted_videos: number }>(
    `/admin/channels/${encodeURIComponent(channelId)}${query({ l2 })}`,
    { method: 'DELETE' },
  );
  log('content-api channel deleted', {
    channelId,
    l2,
    deletedVideos: result.deleted_videos,
  });
  return result;
}

export interface ChannelVideos {
  channel: { title: string; thumbnail: string } | null;
  videos: ChannelVideo[];
  page: number;
  hasMore: boolean;
}

export async function listChannelVideos(
  channelId: string,
  l2: string,
  page = 1,
  pageSize = 24,
): Promise<ChannelVideos> {
  return request<ChannelVideos>(
    `/channels/${encodeURIComponent(channelId)}/videos${query({
      l2,
      page,
      page_size: pageSize,
    })}`,
  );
}

/** `/videos/count` answers `text/plain`, not JSON. */
export async function countVideos(
  l2: string,
  type: 'new_videos' | 'tv_show' | 'talk' | 'all' = 'all',
  id?: number,
): Promise<number> {
  const res = await authenticatedFetch(
    `${PYTHON_API_URL}/videos/count${query({ l2, type, id })}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  const text = await res.text();
  return Number.parseInt(text, 10) || 0;
}

// ── Content health / derived-data maintenance (SPEC-106) ────────────────

export interface MaintenanceRun {
  kind: string;
  started_at: string | null;
  finished_at: string | null;
  processed: number;
  failed: number;
  detail: string | null;
}

export interface ContentHealth {
  pending_embeddings: number;
  failed_embeddings: number;
  missing_embeddings: number;
  missing_ngram: number;
  revision: { rev: number; updated_at: string } | null;
  last_run: MaintenanceRun | null;
}

export interface EmbeddingRunResult {
  processed: number;
  failed: number;
  remaining: number;
}

export interface NgramRunResult {
  processed: number;
  remaining: number;
}

export async function getContentHealth(): Promise<ContentHealth> {
  return request<ContentHealth>('/admin/content-health');
}

export async function runEmbeddings(limit = 50): Promise<EmbeddingRunResult> {
  const body = { limit };
  return request<EmbeddingRunResult>(
    '/admin/maintenance/run-embeddings',
    jsonInit('POST', body),
    body,
  );
}

export async function reindexNgram(limit = 100): Promise<NgramRunResult> {
  const body = { limit };
  return request<NgramRunResult>(
    '/admin/maintenance/reindex-ngram',
    jsonInit('POST', body),
    body,
  );
}

export async function clearSearchCache(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/admin/cache/bust', { method: 'POST' });
}
