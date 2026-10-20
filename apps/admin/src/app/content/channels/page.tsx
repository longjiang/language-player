'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { Field, FormSection } from '@/components/content/field';
import { L2Select } from '@/components/content/l2-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import {
  importChannel,
  listChannelVideos,
  listChannels,
  resolveChannel,
} from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import type {
  AdminChannel,
  ChannelVideo,
  ImportSummary,
  ImportVideoResult,
  ResolvedChannel,
} from '@/types/content';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  ListVideo,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const EMPTY_SUMMARY: ImportSummary = { total: 0, added: 0, updated: 0, skipped: 0, failed: 0 };

export default function ChannelsPage() {
  const t = useT();
  const router = useRouter();
  const authReady = useAuthReady();

  // Deliberately unset: a defaulted language is how content gets
  // imported or edited in the wrong one (SPEC-099). A `?l2=` from the channel
  // detail page is an explicit admin choice, never a default.
  const [l2, setL2] = useState<string | null>(null);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [reference, setReference] = useState('');
  const [resolved, setResolved] = useState<ResolvedChannel | null>(null);
  const [resolving, setResolving] = useState(false);

  const [limit, setLimit] = useState(50);
  const [matchKeywords, setMatchKeywords] = useState('');
  const [circuitBreak, setCircuitBreak] = useState(true);
  const [talk, setTalk] = useState('');
  const [tvShow, setTvShow] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ImportVideoResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary>(EMPTY_SUMMARY);
  const [circuitBroken, setCircuitBroken] = useState(false);
  const stopRef = useRef(false);

  const [openChannel, setOpenChannel] = useState<string | null>(null);
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [videosLoading, setVideosLoading] = useState(false);

  // Returning from a channel detail page carries the language in `?l2=`, so
  // the list reopens on the same language instead of the empty picker.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('l2');
    if (value?.trim()) setL2(value.trim());
  }, []);

  function channelHref(channelId: string): string {
    return `/content/channels/${encodeURIComponent(channelId)}${
      l2 ? `?l2=${encodeURIComponent(l2)}` : ''
    }`;
  }

  const load = useCallback(async () => {
    if (!authReady || !l2) return;
    setLoading(true);
    setError('');
    log('channels load', { l2 });
    try {
      const rows = await listChannels(l2);
      setChannels(rows);
      log('channels loaded', { l2, count: rows.length });
    } catch (err) {
      logerr('channels load failed', err);
      setChannels([]);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setLoading(false);
    }
  }, [authReady, l2, t]);

  useEffect(() => {
    setOpenChannel(null);
    void load();
  }, [load]);

  async function runResolve() {
    if (!reference.trim()) return;
    setResolving(true);
    try {
      setResolved(await resolveChannel(reference.trim()));
    } catch (err) {
      logerr('channel resolve failed', err);
      setResolved(null);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setResolving(false);
    }
  }

  /** Walk the channel's uploads playlist until the cursor or the circuit break. */
  async function runImport() {
    if (!l2 || !reference.trim()) {
      toast.error(t('msg.channel_required'));
      return;
    }
    setRunning(true);
    stopRef.current = false;
    setResults([]);
    setSummary(EMPTY_SUMMARY);
    setCircuitBroken(false);
    let cursor = null;
    let page = 0;
    let accumulated = { ...EMPTY_SUMMARY };
    try {
      while (true) {
        log('channel import page', { page: page + 1, cursor });
        const response = await importChannel({
          l2,
          channel: reference.trim(),
          cursor,
          limit,
          force: false,
          match_keywords: matchKeywords.trim() || undefined,
          use_circuit_break: circuitBreak,
          talk: talk.trim() || undefined,
          tv_show: tvShow.trim() || undefined,
        });
        setResults((prev) => [...prev, ...(response.results ?? [])]);
        accumulated = {
          total: accumulated.total + (response.summary?.total ?? 0),
          added: accumulated.added + (response.summary?.added ?? 0),
          updated: accumulated.updated + (response.summary?.updated ?? 0),
          skipped: accumulated.skipped + (response.summary?.skipped ?? 0),
          failed: accumulated.failed + (response.summary?.failed ?? 0),
        };
        setSummary(accumulated);
        if (response.channel) setResolved(response.channel);
        setCircuitBroken(!!response.circuit_broken);
        page += 1;
        if (!response.next_cursor || response.circuit_broken || stopRef.current) break;
        if (page >= 20) break;
        cursor = response.next_cursor;
      }
      log('channel import finished', { pages: page, circuitBroken });
      toast.success(t('msg.import_finished'));
      void load();
    } catch (err) {
      logerr('channel import failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRunning(false);
    }
  }

  async function loadChannelVideos(channelId: string, page: number) {
    if (!l2) return;
    setVideosLoading(true);
    try {
      const data = await listChannelVideos(channelId, l2, page);
      setChannelVideos(data.videos);
      setHasMore(data.hasMore);
      setVideoPage(data.page);
    } catch (err) {
      logerr('channel videos failed', { channelId, page, err });
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setVideosLoading(false);
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.channels')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('msg.channels_admin_hint')}</p>
        </div>
        <div className="w-40">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('label.language')}
          </span>
          <L2Select value={l2} onChange={setL2} className="w-full" />
          {!l2 && (
            <span className="mt-1 block text-xs text-amber-600">
              {t('msg.choose_language_first')}
            </span>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <CardContent className="space-y-5 pt-6">
          <Field label={t('label.channel_ref')} hint={t('msg.channel_ref_hint')}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                className="flex-1"
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  setResolved(null);
                }}
                placeholder="@handle / UC… / channel URL"
              />
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                disabled={resolving || !reference.trim()}
                onClick={() => void runResolve()}
              >
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t('action.resolve')}
              </Button>
            </div>
          </Field>

          {resolved && (
            // The lookup result is the same channel the list rows open, so it
            // navigates to the detail page instead of being a dead-end card.
            <Link
              href={channelHref(resolved.channel_id)}
              className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="font-medium group-hover:text-primary">{resolved.title}</div>
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
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          )}

          <div className="border-t border-border" />

          <FormSection title={t('title.import_options')} className="space-y-4">
            <Field label={t('label.match_keywords')} hint={t('msg.match_keywords_hint')}>
              <Input value={matchKeywords} onChange={(e) => setMatchKeywords(e.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('label.limit')}>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 50)}
                />
              </Field>
              <Field label={t('title.tv_show')} hint={t('msg.show_or_talk_hint')}>
                <Input value={tvShow} onChange={(e) => setTvShow(e.target.value)} />
              </Field>
              <Field label={t('label.talk')}>
                <Input value={talk} onChange={(e) => setTalk(e.target.value)} />
              </Field>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={circuitBreak}
                  onChange={(e) => setCircuitBreak(e.target.checked)}
                />
                {t('label.use_circuit_break')}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="w-full sm:w-auto"
                  disabled={running || !authReady || !l2}
                  onClick={() => void runImport()}
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t('action.import_uploads')}
                </Button>
                {running && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      stopRef.current = true;
                      log('channel import stop requested');
                    }}
                  >
                    <CircleStop className="h-4 w-4" />
                    {t('action.stop')}
                  </Button>
                )}
              </div>
            </div>
          </FormSection>

          {(results.length > 0 || summary.total > 0) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {t('label.added')}: {summary.added}
                </Badge>
                <Badge variant="secondary">
                  {t('label.updated')}: {summary.updated}
                </Badge>
                <Badge variant="secondary">
                  {t('label.skipped')}: {summary.skipped}
                </Badge>
                <Badge variant={summary.failed ? 'destructive' : 'secondary'}>
                  {t('label.failed')}: {summary.failed}
                </Badge>
                {circuitBroken && <Badge variant="warning">{t('label.circuit_broken')}</Badge>}
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">{t('label.youtube_id')}</th>
                      <th className="px-3 py-2">{t('label.status')}</th>
                      <th className="px-3 py-2">{t('label.reason')}</th>
                      <th className="px-3 py-2">{t('label.title')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={`${result.youtube_id}-${index}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{result.youtube_id}</td>
                        <td className="px-3 py-2">{result.status}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {result.reason ?? result.error ?? '—'}
                        </td>
                        <td className="max-w-[20rem] truncate px-3 py-2">{result.title ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('msg.loading')}
        </div>
      )}

      {!l2 && !loading && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="font-medium">{t('msg.choose_language_first')}</p>
          </CardContent>
        </Card>
      )}

      {l2 && !loading && channels.length === 0 && !error && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="font-medium">{t('msg.no_channels_found')}</p>
          </CardContent>
        </Card>
      )}

      {!loading && channels.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[58rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('label.title')}</th>
                <th className="px-3 py-2">{t('label.channel_id')}</th>
                <th className="px-3 py-2">{t('label.subscribers')}</th>
                <th className="px-3 py-2">{t('label.videos')}</th>
                <th className="px-3 py-2">{t('label.country')}</th>
                <th className="px-3 py-2">{t('label.description')}</th>
                <th className="px-3 py-2 text-right">{t('label.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr
                  key={channel.id}
                  className="group cursor-pointer border-t border-border align-top transition-colors hover:bg-muted/30"
                  onClick={() => router.push(channelHref(channel.channel_id))}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {channel.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={channel.thumbnail}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={channelHref(channel.channel_id)}
                          className="font-medium hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {channel.title ?? '—'}
                        </Link>
                        {channel.custom_url && (
                          <div className="text-xs text-muted-foreground">{channel.custom_url}</div>
                        )}
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{channel.channel_id}</td>
                  <td className="px-3 py-2">{channel.subscribers ?? '—'}</td>
                  <td className="px-3 py-2">{channel.video_count ?? '—'}</td>
                  <td className="px-3 py-2">{channel.country ?? '—'}</td>
                  <td className="max-w-[20rem] px-3 py-2 text-xs text-muted-foreground">
                    <span className="line-clamp-2">{channel.description ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (openChannel === channel.channel_id) {
                            setOpenChannel(null);
                            return;
                          }
                          setOpenChannel(channel.channel_id);
                          setChannelVideos([]);
                          setVideoPage(1);
                          void loadChannelVideos(channel.channel_id, 1);
                        }}
                      >
                        <ListVideo className="h-4 w-4" />
                        {t('label.videos')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReference(channel.channel_id)}
                      >
                        {t('action.import')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {openChannel && (
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={7} className="px-3 py-3">
                    {videosLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('msg.loading')}
                      </div>
                    ) : channelVideos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('msg.no_videos_found')}</p>
                    ) : (
                      <>
                        <ul className="space-y-1 text-sm">
                          {channelVideos.map((video) => (
                            <li
                              key={video.youtube_id}
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="min-w-0 flex-1 truncate">{video.title ?? '—'}</span>
                              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="font-mono">{video.youtube_id}</span>
                                <span>
                                  {t('label.views')}: {video.views ?? '—'}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {t('label.page')} {videoPage}
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={videoPage === 1}
                              onClick={() => void loadChannelVideos(openChannel, videoPage - 1)}
                            >
                              <ChevronLeft className="h-4 w-4" />
                              {t('action.previous')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!hasMore}
                              onClick={() => void loadChannelVideos(openChannel, videoPage + 1)}
                            >
                              {t('action.next')}
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{t('msg.channels_readonly_note')}</p>
    </AdminShell>
  );
}
