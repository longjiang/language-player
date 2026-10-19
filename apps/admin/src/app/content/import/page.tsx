'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { Field, FormSection } from '@/components/content/field';
import { L2Select } from '@/components/content/l2-select';
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
  importChannel,
  importPlaylist,
  importSingle,
  languageMismatches,
  mergePreflight,
  preflightVideos,
  resolveChannel,
} from '@/lib/content-api';
import { LanguageCheckNotice, useMismatchDescription } from '@/components/content/language-check';
import { ConfirmDialog } from '@/components/content/confirm-dialog';
import { log, logerr } from '@/lib/logger';
import { parseVideoIds } from '@/lib/video-ids';
import type {
  ImportCursor,
  ImportResponse,
  ImportSummary,
  ImportVideoResult,
  PreflightResponse,
  ResolvedChannel,
} from '@/types/content';
import {
  AlertCircle,
  CircleStop,
  Loader2,
  Play,
  Search,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type Mode = 'single' | 'batch' | 'channel' | 'playlist';

const EMPTY_SUMMARY: ImportSummary = { total: 0, added: 0, updated: 0, skipped: 0, failed: 0 };

function accumulate(previous: ImportSummary, next: ImportSummary): ImportSummary {
  return {
    total: previous.total + (next.total ?? 0),
    added: previous.added + (next.added ?? 0),
    updated: previous.updated + (next.updated ?? 0),
    skipped: previous.skipped + (next.skipped ?? 0),
    failed: previous.failed + (next.failed ?? 0),
    requested: (previous.requested ?? 0) + (next.requested ?? 0),
    invalid: (previous.invalid ?? 0) + (next.invalid ?? 0),
    caption_service_unavailable:
      (previous.caption_service_unavailable ?? 0) + (next.caption_service_unavailable ?? 0),
    transcript_too_short:
      (previous.transcript_too_short ?? 0) + (next.transcript_too_short ?? 0),
  };
}

function statusVariant(status: ImportVideoResult['status']) {
  if (status === 'added') return 'success' as const;
  if (status === 'updated') return 'default' as const;
  if (status === 'failed') return 'destructive' as const;
  return 'secondary' as const;
}

export default function ImportPage() {
  const t = useT();
  const authReady = useAuthReady();

  const [mode, setMode] = useState<Mode>('single');
  // Deliberately unset: a defaulted language is how content gets
  // imported into the wrong one (SPEC-099).
  const [l2, setL2] = useState<string | null>(null);

  // Shared import options.
  const [force, setForce] = useState(false);
  const [cleanGenerated, setCleanGenerated] = useState(false);
  const [refreshExisting, setRefreshExisting] = useState(true);
  const [limit, setLimit] = useState(50);
  const [talk, setTalk] = useState('');
  const [tvShow, setTvShow] = useState('');
  const [matchKeywords, setMatchKeywords] = useState('');
  const [circuitBreak, setCircuitBreak] = useState(true);
  const [maxPages, setMaxPages] = useState(20);

  // Per-mode inputs.
  const [youtubeId, setYoutubeId] = useState('');
  const [idsText, setIdsText] = useState('');
  const [channelRef, setChannelRef] = useState('');
  const [playlistRef, setPlaylistRef] = useState('');
  const [resolved, setResolved] = useState<ResolvedChannel | null>(null);
  const [resolving, setResolving] = useState(false);

  // Run state.
  const [running, setRunning] = useState(false);
  const [pages, setPages] = useState(0);
  const [results, setResults] = useState<ImportVideoResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary>(EMPTY_SUMMARY);
  const [pendingCursor, setPendingCursor] = useState<ImportCursor | null>(null);
  const [error, setError] = useState('');
  const stopRef = useRef(false);

  // Pre-import language check (SPEC-099): the backend's own verdict, never a
  // client-side guess, so locale variants (zh-Hant under zh) are not flagged.
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightError, setPreflightError] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState<{ description: string; run: () => void } | null>(null);
  const mismatchDescription = useMismatchDescription();

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

  function options() {
    return {
      force,
      clean_generated: cleanGenerated,
      refresh_existing: refreshExisting,
      talk: talk.trim() || undefined,
      tv_show: tvShow.trim() || undefined,
      match_keywords: matchKeywords.trim() || undefined,
      use_circuit_break: circuitBreak,
      limit,
    };
  }

  function resetRun() {
    stopRef.current = false;
    setResults([]);
    setSummary(EMPTY_SUMMARY);
    setPages(0);
    setPendingCursor(null);
    setError('');
    // Note: the language-check panel is NOT cleared here — for a single import
    // the check runs immediately before this, and wiping it would hide the
    // very warning the admin just saw. startLoop clears it for the walked
    // modes, and checkLanguages overwrites it for the guarded ones.
  }

  /** Run the backend's metadata-only verdict for `ids` and show it. */
  async function checkLanguages(ids: string[]): Promise<PreflightResponse | null> {
    if (!l2 || ids.length === 0) return null;
    setChecking(true);
    setPreflightError('');
    try {
      const response = await preflightVideos(l2, ids);
      setPreflight(response);
      return response;
    } catch (err) {
      logerr('language preflight failed', err);
      setPreflightError(err instanceof Error ? err.message : t('error.general'));
      return null;
    } finally {
      setChecking(false);
    }
  }

  /** Gate an import on the language check; ask before a known mismatch. */
  async function guard(candidateIds: string[], run: () => void | Promise<void>) {
    const response = await checkLanguages(candidateIds);
    if (response && languageMismatches(response).length > 0) {
      setConfirm({ description: mismatchDescription(response), run: () => void run() });
      return;
    }
    await run();
  }

  async function startSingle() {
    if (!l2 || !youtubeId.trim()) {
      toast.error(t('msg.video_id_and_language_required'));
      return;
    }
    await guard([youtubeId.trim()], runSingle);
  }

  async function runSingle() {
    if (!l2 || !youtubeId.trim()) {
      toast.error(t('msg.video_id_and_language_required'));
      return;
    }
    resetRun();
    setRunning(true);
    try {
      const result = await importSingle({
        l2,
        youtube_id: youtubeId.trim(),
        force,
        clean_generated: cleanGenerated,
        refresh_existing: refreshExisting,
        talk: talk.trim() || undefined,
        tv_show: tvShow.trim() || undefined,
      });
      setResults([result]);
      setSummary({
        ...EMPTY_SUMMARY,
        total: 1,
        added: result.status === 'added' ? 1 : 0,
        updated: result.status === 'updated' ? 1 : 0,
        skipped: result.status === 'skipped' ? 1 : 0,
        failed: result.status === 'failed' ? 1 : 0,
      });
      setPages(1);
    } catch (err) {
      logerr('import single failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRunning(false);
    }
  }

  /**
   * Drive one page per request until the backend's cursor is exhausted, the
   * circuit break trips, the page cap is hit, or the user stops. Each page
   * commits server-side, so stopping early never loses work.
   */
  async function startLoop() {
    if (!l2) {
      toast.error(t('msg.language_required'));
      return;
    }
    if (mode === 'batch') {
      const ids = parseVideoIds(idsText);
      if (ids.length === 0) {
        toast.error(t('msg.ids_required'));
        return;
      }
      // Known up front, so check the whole list before anything is written.
      await guard(ids, () => runLoop(null));
      return;
    }
    // Channel / playlist ids are only known as the walk returns them, so the
    // check happens per page instead (see runLoop). Start from a clean panel
    // so the previous run's findings cannot masquerade as this one's.
    setPreflight(null);
    setPreflightError('');
    await runLoop(null);
  }

  async function runLoop(cursor: ImportCursor | null) {
    if (!l2) {
      toast.error(t('msg.language_required'));
      return;
    }
    setRunning(true);
    stopRef.current = false;
    let current = cursor;
    let page = pages;
    try {
      while (true) {
        log('import page start', { mode, page: page + 1, cursor: current, maxPages });
        let response: ImportResponse;
        if (mode === 'batch') {
          const ids = parseVideoIds(idsText);
          if (ids.length === 0) {
            toast.error(t('msg.ids_required'));
            return;
          }
          const pageSize = Math.min(limit, ids.length);
          const offset = current?.offset ?? 0;
          response = await importBatch({
            ...options(),
            l2,
            youtube_ids: ids.slice(offset, offset + pageSize),
            cursor: null,
            limit: pageSize,
          });
          // The endpoint re-derives its cursor from `offset`; keep our own so
          // the loop stays correct when the whole list is longer than `limit`.
          const nextOffset = offset + pageSize;
          response.next_cursor = nextOffset < ids.length ? { offset: nextOffset } : null;
        } else if (mode === 'channel') {
          if (!channelRef.trim()) {
            toast.error(t('msg.channel_required'));
            return;
          }
          response = await importChannel({ ...options(), l2, channel: channelRef.trim(), cursor: current });
        } else {
          if (!playlistRef.trim()) {
            toast.error(t('msg.playlist_required'));
            return;
          }
          response = await importPlaylist({
            ...options(),
            l2,
            playlist: playlistRef.trim(),
            cursor: current,
          });
        }

        setResults((prev) => [...prev, ...(response.results ?? [])]);
        setSummary((prev) => accumulate(prev, response.summary ?? EMPTY_SUMMARY));
        if (response.channel) setResolved(response.channel);
        page += 1;
        setPages(page);

        // A walked page is already committed, so audit what it stored and
        // report mismatches instead of silently moving on (SPEC-099).
        if (mode !== 'batch') {
          const stored = (response.results ?? [])
            .filter((r) => r.status === 'added' || r.status === 'updated')
            .map((r) => r.youtube_id);
          if (stored.length > 0) {
            const audited = await checkLanguages(stored);
            if (audited) setPreflight((prev) => mergePreflight(prev, audited));
          }
        }

        const next = response.next_cursor;
        if (!next || response.circuit_broken) {
          log('import loop finished', { page, reason: response.circuit_broken ? 'circuit_break' : 'cursor_exhausted' });
          setPendingCursor(null);
          break;
        }
        if (stopRef.current) {
          log('import loop stopped by user', { page });
          setPendingCursor(next);
          break;
        }
        if (page >= maxPages) {
          log('import loop hit the page cap', { page, maxPages });
          setPendingCursor(next);
          break;
        }
        current = next;
      }
    } catch (err) {
      logerr('import loop failed', { mode, page, err });
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRunning(false);
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

  const busy = running || !authReady;

  const summaryChips: [string, number][] = [
    [t('label.added'), summary.added],
    [t('label.updated'), summary.updated],
    [t('label.skipped'), summary.skipped],
    [t('label.failed'), summary.failed],
  ];

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
          <L2Select value={l2} onChange={setL2} className="w-full" />
          {!l2 && (
            <span className="mt-1 block text-xs text-amber-600">{t('msg.choose_language_first')}</span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="pt-6">
            <Tabs value={mode} onValueChange={(next) => setMode(next as Mode)}>
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
                    onChange={(e) => setYoutubeId(e.target.value)}
                    placeholder="dQw4w9WgXcQ"
                  />
                </Field>
                <Button disabled={busy || !l2} onClick={() => void startSingle()}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t('action.import')}
                </Button>
              </TabsContent>

              <TabsContent value="batch" className="space-y-3">
                <Field label={t('label.youtube_ids')} hint={t('msg.ids_hint')}>
                  <Textarea
                    rows={6}
                    value={idsText}
                    onChange={(e) => setIdsText(e.target.value)}
                    className="font-mono text-xs"
                  />
                </Field>
                <Button disabled={busy || !l2} onClick={() => void startLoop()}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {t('action.start_import')}
                </Button>
              </TabsContent>

              <TabsContent value="channel" className="space-y-3">
                <Field label={t('label.channel_ref')} hint={t('msg.channel_ref_hint')}>
                  <div className="flex gap-2">
                    <Input
                      value={channelRef}
                      onChange={(e) => {
                        setChannelRef(e.target.value);
                        setResolved(null);
                      }}
                      placeholder="@handle / UC… / channel URL"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={resolving || !channelRef.trim()}
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
                <Button disabled={busy || !l2} onClick={() => void startLoop()}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {t('action.import_uploads')}
                </Button>
              </TabsContent>

              <TabsContent value="playlist" className="space-y-3">
                <Field
                  label={t('title.playlist')}
                  hint={t('placeholder.playlist_id_or_url')}
                >
                  <Input
                    value={playlistRef}
                    onChange={(e) => setPlaylistRef(e.target.value)}
                    placeholder="PL… / https://www.youtube.com/playlist?list=…"
                  />
                </Field>
                <Button disabled={busy || !l2} onClick={() => void startLoop()}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {t('action.start_import')}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <FormSection title={t('title.import_options')}>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />
                  {t('label.force')}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={cleanGenerated}
                    onChange={(e) => setCleanGenerated(e.target.checked)}
                  />
                  {t('label.clean_generated')}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={refreshExisting}
                    onChange={(e) => setRefreshExisting(e.target.checked)}
                  />
                  {t('label.refresh_existing')}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={circuitBreak}
                    onChange={(e) => setCircuitBreak(e.target.checked)}
                  />
                  {t('label.use_circuit_break')}
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('label.limit')}>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value) || 50)}
                  />
                </Field>
                <Field label={t('label.max_pages')}>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value) || 20)}
                  />
                </Field>
              </div>
              <Field label={t('label.assignment')} hint={t('msg.show_or_talk_hint')}>
                <div className="space-y-2">
                  <Input
                    value={tvShow}
                    onChange={(e) => setTvShow(e.target.value)}
                    placeholder={t('title.tv_show')}
                  />
                  <Input
                    value={talk}
                    onChange={(e) => setTalk(e.target.value)}
                    placeholder={t('label.talk')}
                  />
                </div>
              </Field>
              <Field label={t('label.match_keywords')} hint={t('msg.match_keywords_hint')}>
                <Input value={matchKeywords} onChange={(e) => setMatchKeywords(e.target.value)} />
              </Field>
            </FormSection>

            {running && (
              <Button variant="destructive" className="w-full" onClick={() => (stopRef.current = true)}>
                <CircleStop className="h-4 w-4" />
                {t('action.stop')}
              </Button>
            )}
            {!running && pendingCursor && (
              <Button className="w-full" onClick={() => void runLoop(pendingCursor)}>
                <Play className="h-4 w-4" />
                {t('action.continue')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-5">
        <LanguageCheckNotice
          response={preflight}
          checking={checking}
          error={preflightError}
          extraNote={mode === 'batch' ? undefined : t('msg.language_check_channel_note')}
        />
      </div>

      {(pages > 0 || summary.total > 0) && (
        <Card className="mt-5">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{t('label.summary')}</span>
              {summaryChips.map(([label, value]) => (
                <Badge key={label} variant="secondary">
                  {label}: {value}
                </Badge>
              ))}
              {summary.invalid ? (
                <Badge variant="destructive">
                  invalid: {summary.invalid}
                </Badge>
              ) : null}
              {summary.caption_service_unavailable ? (
                <Badge variant="warning">
                  caption_service_unavailable: {summary.caption_service_unavailable}
                </Badge>
              ) : null}
              {summary.transcript_too_short ? (
                <Badge variant="warning">
                  transcript_too_short: {summary.transcript_too_short}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {t('msg.pages_processed', { count: pages })}
              </span>
            </div>

            {results.length > 0 && (
              <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">{t('label.youtube_id')}</th>
                      <th className="px-3 py-2">{t('label.status')}</th>
                      <th className="px-3 py-2">{t('label.reason')}</th>
                      <th className="px-3 py-2">{t('label.title')}</th>
                      <th className="px-3 py-2">{t('label.lines')}</th>
                      <th className="px-3 py-2">{t('label.difficulty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={`${result.youtube_id}-${index}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{result.youtube_id}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {result.reason ?? result.error ?? '—'}
                        </td>
                        <td className="max-w-[18rem] truncate px-3 py-2">{result.title ?? '—'}</td>
                        <td className="px-3 py-2">{result.lines ?? '—'}</td>
                        <td className="px-3 py-2">
                          {result.difficulty == null ? '—' : Number(result.difficulty).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
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
