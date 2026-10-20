'use client';

import { ConfirmDialog } from '@/components/content/confirm-dialog';
import { Field, FormSection } from '@/components/content/field';
import { L2Select } from '@/components/content/l2-select';
import { LanguageCheckNotice, useMismatchDescription } from '@/components/content/language-check';
import { ScreeningTable } from '@/components/content/screening-table';
import { AdminShell } from '@/components/layout/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import {
  importBatch,
  importSingle,
  listVideoIds,
  resolveChannel,
  screenVideos,
} from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import {
  buildPreflight,
  eligibleRows as eligibleRowsFor,
  mergeScreenedRows,
  type ScreeningRowState,
} from '@/lib/screening';
import { parseVideoIds } from '@/lib/video-ids';
import type {
  CaptionError,
  ImportCursor,
  ImportVideoResult,
  ResolvedChannel,
  ScreeningResponse,
} from '@/types/content';
import {
  AlertCircle,
  CircleStop,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type Mode = 'single' | 'batch' | 'channel' | 'playlist';

/** The backend accepts at most 50 ids per screening call. */
const SCREEN_BATCH = 50;

type Stage = 'idle' | 'listing' | 'screening' | 'done' | 'stopped' | 'error';

const EMPTY_ADD_COUNTS = { added: 0, updated: 0, skipped: 0, failed: 0 };

export default function ImportPage() {
  const t = useT();
  const authReady = useAuthReady();

  const [mode, setMode] = useState<Mode>('single');
  // Deliberately unset: a defaulted language is how content gets imported
  // into the wrong one (SPEC-099).
  const [l2, setL2] = useState<string | null>(null);

  // Source inputs.
  const [youtubeId, setYoutubeId] = useState('');
  const [idsText, setIdsText] = useState('');
  const [channelRef, setChannelRef] = useState('');
  const [playlistRef, setPlaylistRef] = useState('');
  const [resolved, setResolved] = useState<ResolvedChannel | null>(null);
  const [resolving, setResolving] = useState(false);
  const [matchKeywords, setMatchKeywords] = useState('');

  // Add-phase options. Discovery is read-only; these are used only by the
  // importer, but `force` also changes which rows count as eligible.
  const [force, setForce] = useState(false);
  const [cleanGenerated, setCleanGenerated] = useState(false);
  const [refreshExisting, setRefreshExisting] = useState(true);
  const [talk, setTalk] = useState('');
  const [tvShow, setTvShow] = useState('');

  // Discovery run.
  const [stage, setStage] = useState<Stage>('idle');
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [rows, setRows] = useState<ScreeningRowState[]>([]);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [l2Locales, setL2Locales] = useState<string[]>([]);
  const [captionError, setCaptionError] = useState<CaptionError | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [listed, setListed] = useState(0);

  // Add run.
  const [addingAll, setAddingAll] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ description: string; run: () => void } | null>(null);
  const mismatchDescription = useMismatchDescription();

  const stopRef = useRef(false);
  const cursorRef = useRef<ImportCursor | null>(null);
  const queueRef = useRef<string[]>([]);
  const sourceDoneRef = useRef(true);
  const sourceRef = useRef<{ channel?: string; playlist?: string }>({});
  const listedSetRef = useRef<Set<string>>(new Set());

  // The channel detail page deep-links here with `?mode=channel&l2=&channel=`.
  // The language is still an explicit admin choice (SPEC-099), never a default.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get('mode');
    const requestedL2 = params.get('l2');
    const requestedChannel = params.get('channel');
    if (
      requestedMode === 'single' ||
      requestedMode === 'batch' ||
      requestedMode === 'channel' ||
      requestedMode === 'playlist'
    ) {
      setMode(requestedMode);
    }
    if (requestedL2?.trim()) setL2(requestedL2.trim());
    if (requestedChannel?.trim()) setChannelRef(requestedChannel.trim());
  }, []);

  function resetDiscovery() {
    stopRef.current = false;
    cursorRef.current = null;
    queueRef.current = [];
    sourceDoneRef.current = true;
    sourceRef.current = {};
    listedSetRef.current = new Set();
    setRows([]);
    setInvalidIds([]);
    setL2Locales([]);
    setCaptionError(null);
    setError('');
    setPending(false);
    setListed(0);
    setStage('idle');
  }

  /** Reset the result set when the admin picks a different language. */
  function changeLanguage(next: string | null) {
    if (next === l2) return;
    setL2(next);
    if (!running) resetDiscovery();
  }

  /** Seed the queue from the selected source. Returns false on invalid input. */
  function prepareSource(): boolean {
    if (mode === 'single') {
      const ids = [...new Set(parseVideoIds(youtubeId))];
      if (ids.length === 0) {
        toast.error(t('msg.video_id_and_language_required'));
        return false;
      }
      queueRef.current = ids;
      sourceDoneRef.current = true;
      sourceRef.current = {};
      return true;
    }
    if (mode === 'batch') {
      const ids = [...new Set(parseVideoIds(idsText))];
      if (ids.length === 0) {
        toast.error(t('msg.ids_required'));
        return false;
      }
      queueRef.current = ids;
      sourceDoneRef.current = true;
      sourceRef.current = {};
      return true;
    }
    if (mode === 'channel') {
      if (!channelRef.trim()) {
        toast.error(t('msg.channel_required'));
        return false;
      }
      queueRef.current = [];
      sourceDoneRef.current = false;
      sourceRef.current = { channel: channelRef.trim() };
      return true;
    }
    if (!playlistRef.trim()) {
      toast.error(t('msg.playlist_required'));
      return false;
    }
    queueRef.current = [];
    sourceDoneRef.current = false;
    sourceRef.current = { playlist: playlistRef.trim() };
    return true;
  }

  function applyScreenResponse(response: ScreeningResponse) {
    if (response.l2_locales?.length) setL2Locales(response.l2_locales);
    setRows((previous) => mergeScreenedRows(previous, response.results ?? []));
    if (response.invalid?.length) {
      setInvalidIds((previous) => [...new Set([...previous, ...response.invalid])]);
    }
    if (response.caption_error) setCaptionError(response.caption_error);
  }

  /**
   * Drive the read-only discovery phase one bounded page at a time.
   *
   * For a pasted list, the queue is seeded up front and screened in batches of
   * 50. For a channel/playlist, one id page is listed, then screened, then the
   * next page is listed — so results appear while a large channel is still
   * being walked, and no server-side job survives the request.
   */
  async function runDiscovery(resume: boolean) {
    if (!l2) {
      toast.error(t('msg.language_required'));
      return;
    }
    if (running) return;
    if (!resume) {
      resetDiscovery();
      if (!prepareSource()) return;
      listedSetRef.current = new Set(queueRef.current);
      setListed(queueRef.current.length);
    }

    const targetL2 = l2;
    stopRef.current = false;
    setRunning(true);
    setError('');
    setCaptionError(null);
    setPending(false);
    try {
      while (!stopRef.current) {
        if (queueRef.current.length === 0) {
          if (sourceDoneRef.current) break;
          setStage('listing');
          log('import discovery list page', {
            l2: targetL2,
            cursor: cursorRef.current,
            source: sourceRef.current,
          });
          const page = await listVideoIds({
            l2: targetL2,
            ...sourceRef.current,
            cursor: cursorRef.current,
            limit: SCREEN_BATCH,
            match_keywords: matchKeywords.trim() || undefined,
          });
          if (page.channel) setResolved(page.channel);
          if (page.invalid?.length) {
            setInvalidIds((previous) => [...new Set([...previous, ...page.invalid])]);
          }
          const fresh = page.youtube_ids.filter((id) => !listedSetRef.current.has(id));
          for (const id of fresh) listedSetRef.current.add(id);
          queueRef.current.push(...fresh);
          setListed(listedSetRef.current.size);
          cursorRef.current = page.next_cursor;
          if (!page.next_cursor) sourceDoneRef.current = true;
          continue;
        }

        const batch = queueRef.current.splice(0, SCREEN_BATCH);
        setStage('screening');
        log('import discovery screen batch', { l2: targetL2, size: batch.length });
        const response = await screenVideos({ l2: targetL2, youtube_ids: batch });
        applyScreenResponse(response);
        if (response.caption_error) {
          // Do not hammer a rate-limited caption service. The rows already in
          // this batch are reported as caption_service_unavailable/not_checked
          // and can be retried without re-listing the source.
          setPending(true);
          setStage('stopped');
          return;
        }
      }

      const remaining = queueRef.current.length > 0 || !sourceDoneRef.current;
      if (stopRef.current && remaining) {
        log('import discovery stopped', {
          queued: queueRef.current.length,
          sourceDone: sourceDoneRef.current,
        });
        setPending(true);
        setStage('stopped');
      } else {
        log('import discovery finished', { listed: listedSetRef.current.size });
        setPending(false);
        setStage('done');
      }
    } catch (err) {
      logerr('import discovery failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
      setPending(queueRef.current.length > 0 || !sourceDoneRef.current);
      setStage('error');
    } finally {
      setRunning(false);
    }
  }

  /** Re-list captions for rows the service blocked, without re-enumerating. */
  async function retryUnchecked() {
    if (!l2 || retrying) return;
    const ids = rows
      .filter(
        (row) =>
          !row.in_db &&
          (row.transcript_status === 'not_checked' ||
            row.transcript_status === 'caption_service_unavailable'),
      )
      .map((row) => row.youtube_id);
    if (ids.length === 0) return;

    setRetrying(true);
    setCaptionError(null);
    setError('');
    try {
      let retried = 0;
      for (let start = 0; start < ids.length; start += SCREEN_BATCH) {
        const slice = ids.slice(start, start + SCREEN_BATCH);
        const response = await screenVideos({ l2, youtube_ids: slice });
        applyScreenResponse(response);
        retried += slice.length;
        if (response.caption_error) {
          setCaptionError(response.caption_error);
          break;
        }
      }
      log('import discovery retried transcripts', { retried });
      toast.success(t('msg.retry_done', { count: retried }));
    } catch (err) {
      logerr('import discovery retry failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRetrying(false);
    }
  }

  async function runResolve() {
    if (!channelRef.trim()) return;
    setResolving(true);
    try {
      setResolved(await resolveChannel(channelRef.trim()));
    } catch (err) {
      logerr('channel resolve failed', err);
      setResolved(null);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setResolving(false);
    }
  }

  function applyAddResult(result: ImportVideoResult) {
    setRows((previous) =>
      previous.map((row) => {
        if (row.youtube_id !== result.youtube_id) return row;
        const stored =
          result.status === 'added' ||
          result.status === 'updated' ||
          result.reason === 'exists';
        return {
          ...row,
          in_db: stored || row.in_db,
          db_video_id: result.id ?? row.db_video_id,
          add_status: result.status,
          add_reason: result.reason ?? result.error ?? null,
          transcript_status:
            result.reason === 'no_transcript' ? 'no_transcript' : row.transcript_status,
        };
      }),
    );
  }

  function addOptions() {
    return {
      force,
      clean_generated: cleanGenerated,
      refresh_existing: refreshExisting,
      talk: talk.trim() || undefined,
      tv_show: tvShow.trim() || undefined,
    };
  }

  /** Add one id through the single import; a batch of one would also work. */
  async function addSingleRow(youtubeIdToAdd: string) {
    if (!l2) return;
    setAddingId(youtubeIdToAdd);
    setError('');
    setRows((previous) =>
      previous.map((row) =>
        row.youtube_id === youtubeIdToAdd
          ? { ...row, add_status: 'adding', add_reason: null }
          : row,
      ),
    );
    try {
      const result = await importSingle({ ...addOptions(), l2, youtube_id: youtubeIdToAdd });
      applyAddResult(result);
    } catch (err) {
      logerr('import single failed', err);
      const message = err instanceof Error ? err.message : t('error.general');
      setError(message);
      setRows((previous) =>
        previous.map((row) =>
          row.youtube_id === youtubeIdToAdd
            ? { ...row, add_status: 'failed', add_reason: message }
            : row,
        ),
      );
    } finally {
      setAddingId(null);
    }
  }

  /** Add a set of ids in bounded batches (one page per request). */
  async function addIds(ids: string[]) {
    if (!l2 || ids.length === 0) return;
    setAddingAll(true);
    setError('');
    const submitted = new Set(ids);
    try {
      for (let start = 0; start < ids.length; start += SCREEN_BATCH) {
        const slice = ids.slice(start, start + SCREEN_BATCH);
        for (const id of slice) {
          setRows((previous) =>
            previous.map((row) =>
              row.youtube_id === id ? { ...row, add_status: 'adding', add_reason: null } : row,
            ),
          );
        }
        log('import add batch', { l2, size: slice.length, offset: start });
        const response = await importBatch({
          ...addOptions(),
          l2,
          youtube_ids: slice,
          limit: slice.length,
        });
        for (const result of response.results ?? []) applyAddResult(result);
      }
      toast.success(t('msg.import_finished'));
    } catch (err) {
      logerr('import add failed', err);
      const message = err instanceof Error ? err.message : t('error.general');
      setError(message);
      setRows((previous) =>
        previous.map((row) =>
          submitted.has(row.youtube_id) && row.add_status === 'adding'
            ? { ...row, add_status: 'failed', add_reason: message }
            : row,
        ),
      );
    } finally {
      setAddingAll(false);
    }
  }

  /** Ask before importing rows whose declared audio language is another one. */
  function guardAdd(ids: string[], run: (ids: string[]) => Promise<void>) {
    if (!l2 || ids.length === 0) return;
    const selected = rows.filter((row) => ids.includes(row.youtube_id));
    const check = buildPreflight(selected, l2, l2Locales);
    if (check.summary.mismatched > 0) {
      setConfirm({ description: mismatchDescription(check), run: () => void run(ids) });
      return;
    }
    void run(ids);
  }

  const busy = running || addingAll || retrying || addingId !== null || !authReady;

  const eligible = useMemo(() => eligibleRowsFor(rows, force), [rows, force]);
  const newRows = useMemo(() => rows.filter((row) => !row.in_db), [rows]);
  const uncheckedCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.in_db &&
          (row.transcript_status === 'not_checked' ||
            row.transcript_status === 'caption_service_unavailable'),
      ).length,
    [rows],
  );

  const preflight = useMemo(
    () =>
      l2 && newRows.length > 0
        ? buildPreflight(newRows, l2, l2Locales, invalidIds)
        : null,
    [newRows, l2, l2Locales, invalidIds],
  );

  const progress = useMemo(() => {
    // Rows that were already in the DB when the source was screened. A row
    // added during this session also has `in_db: true`, but it went through
    // the metadata/transcript checks, so it must count on that side instead.
    const discoveredInDb = rows.filter((row) => row.in_db && !row.add_status).length;
    return {
      screened: rows.length,
      inDb: discoveredInDb,
      metadata: rows.length - discoveredInDb,
      transcripts: rows.filter(
        (row) =>
          row.transcript_status === 'found' ||
          row.transcript_status === 'no_transcript' ||
          row.transcript_status === 'caption_service_unavailable',
      ).length,
    };
  }, [rows]);

  const addCounts = useMemo(() => {
    const counts = { ...EMPTY_ADD_COUNTS };
    for (const row of rows) {
      if (row.add_status === 'added') counts.added += 1;
      else if (row.add_status === 'updated') counts.updated += 1;
      else if (row.add_status === 'skipped') counts.skipped += 1;
      else if (row.add_status === 'failed') counts.failed += 1;
    }
    return counts;
  }, [rows]);

  const stageText =
    stage === 'listing'
      ? t('msg.screening_listing')
      : stage === 'screening'
        ? t('msg.screening_checking')
        : stage === 'done'
          ? t('msg.screening_done')
          : stage === 'stopped'
            ? t('msg.screening_stopped')
            : stage === 'idle'
              ? t('msg.screening_idle')
              : '';

  const languageLocked = running || addingAll || retrying || addingId !== null;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('action.import')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('msg.import_hint')}</p>
        </div>
        <div className="w-40">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('label.language')}
          </span>
          <L2Select
            value={l2}
            onChange={changeLanguage}
            className="w-full"
            disabled={languageLocked}
          />
          {!l2 && (
            <span className="mt-1 block text-xs text-amber-600">{t('msg.choose_language_first')}</span>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{t('title.discover_phase')}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('msg.discover_phase_hint')}</p>
            </div>
            <Badge variant="secondary">
              {t('label.ids_found')}: {listed}
            </Badge>
          </div>

          <Tabs
            value={mode}
            onValueChange={(next) => {
              setMode(next as Mode);
              setError('');
            }}
            className="mt-4"
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="single">{t('title.single_video')}</TabsTrigger>
              <TabsTrigger value="batch">{t('title.batch')}</TabsTrigger>
              <TabsTrigger value="channel">{t('title.channel')}</TabsTrigger>
              <TabsTrigger value="playlist">{t('title.playlist')}</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-3">
              <Field label={t('label.youtube_id')} hint={t('placeholder.youtube_id_or_url')}>
                <Input
                  value={youtubeId}
                  onChange={(event) => setYoutubeId(event.target.value)}
                  placeholder="dQw4w9WgXcQ"
                  disabled={running}
                />
              </Field>
            </TabsContent>

            <TabsContent value="batch" className="space-y-3">
              <Field label={t('label.youtube_ids')} hint={t('msg.ids_hint')}>
                <Textarea
                  rows={6}
                  value={idsText}
                  onChange={(event) => setIdsText(event.target.value)}
                  className="font-mono text-xs"
                  disabled={running}
                />
              </Field>
            </TabsContent>

            <TabsContent value="channel" className="space-y-3">
              <Field label={t('label.channel_ref')} hint={t('msg.channel_ref_hint')}>
                <div className="flex gap-2">
                  <Input
                    value={channelRef}
                    onChange={(event) => {
                      setChannelRef(event.target.value);
                      setResolved(null);
                    }}
                    placeholder="@handle / UC… / channel URL"
                    disabled={running}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={resolving || running || !channelRef.trim()}
                    onClick={() => void runResolve()}
                  >
                    {resolving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {t('action.resolve')}
                  </Button>
                </div>
              </Field>
              {resolved && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">{resolved.title}</div>
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                    <span className="font-mono">{resolved.channel_id}</span>
                    <span>{resolved.handle}</span>
                    <span>
                      {t('label.subscribers')}: {resolved.subscribers ?? '—'}
                    </span>
                    <span>
                      {t('label.videos')}: {resolved.video_count ?? '—'}
                    </span>
                    <span className="font-mono">{resolved.uploads_playlist_id}</span>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="playlist" className="space-y-3">
              <Field label={t('title.playlist')} hint={t('placeholder.playlist_id_or_url')}>
                <Input
                  value={playlistRef}
                  onChange={(event) => setPlaylistRef(event.target.value)}
                  placeholder="PL… / https://www.youtube.com/playlist?list=…"
                  disabled={running}
                />
              </Field>
            </TabsContent>
          </Tabs>

          {(mode === 'channel' || mode === 'playlist') && (
            <div className="mt-3">
              <Field label={t('label.match_keywords')} hint={t('msg.match_keywords_hint')}>
                <Input
                  value={matchKeywords}
                  onChange={(event) => setMatchKeywords(event.target.value)}
                  disabled={running}
                />
              </Field>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || !l2}
              onClick={() => void runDiscovery(false)}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {t('action.find_videos')}
            </Button>
            {running && (
              <Button
                variant="destructive"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                <CircleStop className="h-4 w-4" />
                {t('action.stop')}
              </Button>
            )}
            {!running && pending && (
              <Button variant="secondary" onClick={() => void runDiscovery(true)}>
                <Play className="h-4 w-4" />
                {t('action.continue')}
              </Button>
            )}
            {!running && (rows.length > 0 || stage !== 'idle') && (
              <Button variant="outline" onClick={resetDiscovery}>
                <RefreshCw className="h-4 w-4" />
                {t('action.clear')}
              </Button>
            )}
            {stageText && (
              <span className="text-xs text-muted-foreground">{stageText}</span>
            )}
            {(running || retrying) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {(rows.length > 0 || stage !== 'idle') && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">
            {t('label.screened')}: {progress.screened}
          </Badge>
          <Badge variant="secondary">
            {t('label.in_db')}: {progress.inDb}
          </Badge>
          <Badge variant="secondary">
            {t('label.metadata_checked')}: {progress.metadata}
          </Badge>
          <Badge variant="secondary">
            {t('label.transcripts_checked')}: {progress.transcripts}
          </Badge>
          <Badge variant={eligible.length > 0 ? 'success' : 'secondary'}>
            {t('label.eligible')}: {eligible.length}
          </Badge>
          {uncheckedCount > 0 && !running && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void retryUnchecked()}
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('action.retry_unchecked', { count: uncheckedCount })}
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {captionError && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-destructive">
                {t('msg.screening_caption_error', {
                  kind: captionError.kind,
                  message: captionError.message,
                })}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={busy || uncheckedCount === 0}
                onClick={() => void retryUnchecked()}
              >
                {retrying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t('action.retry_unchecked', { count: uncheckedCount })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {invalidIds.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground" title={invalidIds.join(', ')}>
          {t('label.invalid_ids', { count: invalidIds.length })}:{' '}
          <span className="font-mono">
            {invalidIds.slice(0, 10).join(', ')}
            {invalidIds.length > 10 ? '…' : ''}
          </span>
        </p>
      )}

      <div className="mt-5">
        <LanguageCheckNotice response={preflight} checking={running && stage === 'screening'} />
      </div>

      {rows.length > 0 && (
        <Card className="mt-5">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t('title.add_phase')}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('msg.add_phase_hint')}</p>
              </div>
              <Button
                disabled={busy || !l2 || eligible.length === 0}
                onClick={() => guardAdd(eligible.map((row) => row.youtube_id), addIds)}
              >
                {addingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t('action.add_all_eligible', { count: eligible.length })}
              </Button>
            </div>

            <FormSection title={t('title.import_options')}>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox checked={force} onChange={(event) => setForce(event.target.checked)} />
                  {t('label.force')}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={cleanGenerated}
                    onChange={(event) => setCleanGenerated(event.target.checked)}
                  />
                  {t('label.clean_generated')}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={refreshExisting}
                    onChange={(event) => setRefreshExisting(event.target.checked)}
                  />
                  {t('label.refresh_existing')}
                </label>
              </div>
              <Field label={t('label.assignment')} hint={t('msg.show_or_talk_hint')}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={tvShow}
                    onChange={(event) => setTvShow(event.target.value)}
                    placeholder={t('title.tv_show')}
                  />
                  <Input
                    value={talk}
                    onChange={(event) => setTalk(event.target.value)}
                    placeholder={t('label.talk')}
                  />
                </div>
              </Field>
            </FormSection>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">
                {t('label.eligible')}: {eligible.length}
              </Badge>
              <Badge variant="secondary">
                {t('label.added')}: {addCounts.added}
              </Badge>
              <Badge variant="secondary">
                {t('label.updated')}: {addCounts.updated}
              </Badge>
              <Badge variant="secondary">
                {t('label.skipped')}: {addCounts.skipped}
              </Badge>
              <Badge variant={addCounts.failed > 0 ? 'destructive' : 'secondary'}>
                {t('label.failed')}: {addCounts.failed}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('msg.add_all_note')}</p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <ScreeningTable
          rows={rows}
          force={force}
          busy={busy}
          addingId={addingId}
          onAdd={(row) =>
            guardAdd([row.youtube_id], async (ids) => {
              const id = ids[0];
              if (id) await addSingleRow(id);
            })
          }
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('msg.language_mismatch_title')}
        description={confirm?.description ?? ''}
        confirmLabel={t('action.import_anyway')}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          void run?.();
        }}
      />
    </AdminShell>
  );
}
