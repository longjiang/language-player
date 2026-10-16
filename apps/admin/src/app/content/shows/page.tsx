'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { ConfirmDialog } from '@/components/content/confirm-dialog';
import { L2Select } from '@/components/content/l2-select';
import { ShowDialog } from '@/components/content/show-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import { deleteShow, listEpisodes, listShows } from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import type { AdminShow, EpisodeVideo, ShowKind } from '@/types/content';
import {
  AlertCircle,
  Clapperboard,
  ListVideo,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

function kindToKey(kind: ShowKind) {
  return kind === 'tv_shows' ? ('tvShows' as const) : ('talks' as const);
}

export default function ShowsPage() {
  const t = useT();
  const authReady = useAuthReady();

  const [kind, setKind] = useState<ShowKind>('tv_shows');
  const [l2, setL2] = useState<string | null>('en');
  const [includeHidden, setIncludeHidden] = useState(true);
  const [filter, setFilter] = useState('');

  const [shows, setShows] = useState<AdminShow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminShow | null>(null);
  const [deleting, setDeleting] = useState<AdminShow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, EpisodeVideo[]>>({});
  const [episodesLoading, setEpisodesLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    setError('');
    log('shows load', { kind, l2, includeHidden });
    try {
      const rows = await listShows(kind, { l2, includeHidden });
      setShows(rows);
      log('shows loaded', { kind, count: rows.length });
    } catch (err) {
      logerr('shows load failed', err);
      setShows([]);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setLoading(false);
    }
  }, [authReady, kind, l2, includeHidden, t]);

  useEffect(() => {
    setExpanded(null);
    setEpisodes({});
    void load();
  }, [load, reloadKey]);

  const noun = kind === 'talks' ? t('label.talk') : t('title.tv_show');

  async function toggleEpisodes(show: AdminShow) {
    if (expanded === show.id) {
      setExpanded(null);
      return;
    }
    setExpanded(show.id);
    if (episodes[show.id]) return;
    setEpisodesLoading(show.id);
    try {
      const rows = await listEpisodes(kind, show.id, l2);
      setEpisodes((prev) => ({ ...prev, [show.id]: rows }));
      log('episodes loaded', { kind, id: show.id, count: rows.length });
    } catch (err) {
      logerr('episodes load failed', { id: show.id, err });
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setEpisodesLoading(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteShow(kind, deleting.id);
      toast.success(t('msg.show_deleted'));
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      logerr('show delete failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setDeleteBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return shows;
    return shows.filter((show) => (show.title ?? '').toLowerCase().includes(needle));
  }, [shows, filter]);

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.shows_and_talks')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('msg.shows_admin_hint')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('action.new')} {noun}
        </Button>
      </div>

      <Tabs
        value={kindToKey(kind)}
        onValueChange={(next) => setKind(next === 'talks' ? 'talks' : 'tv_shows')}
        className="mt-5"
      >
        <TabsList>
          <TabsTrigger value="tvShows">{t('title.tv_shows')}</TabsTrigger>
          <TabsTrigger value="talks">{t('label.talks')}</TabsTrigger>
        </TabsList>

        <TabsContent value={kindToKey(kind)} className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.language')}
              </span>
              <L2Select value={l2} onChange={setL2} allowAll className="w-full" />
            </div>
            <div className="min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.title')}
              </span>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('placeholder.filter_by_title')}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
              />
              {t('label.include_hidden')}
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t('msg.loading')}
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Clapperboard className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">{t('msg.no_shows_found')}</p>
              </CardContent>
            </Card>
          )}

          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('label.title')}</th>
                    <th className="px-3 py-2">{t('label.language')}</th>
                    {kind === 'tv_shows' ? (
                      <th className="px-3 py-2">{t('label.year')}</th>
                    ) : (
                      <th className="px-3 py-2">{t('label.audiobook')}</th>
                    )}
                    <th className="px-3 py-2">{t('label.avg_views')}</th>
                    <th className="px-3 py-2">{t('label.lex_div')}</th>
                    <th className="px-3 py-2">{t('label.status')}</th>
                    <th className="px-3 py-2 text-right">{t('label.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((show) => (
                    <Fragment key={show.id}>
                      <tr className="border-t border-border align-top">
                        <td className="max-w-[24rem] px-3 py-2">
                          <div className="flex items-start gap-2">
                            {show.youtube_id && (
                              // YouTube thumbnails are plain <img> in the admin app
                              // (no next/image config needed for an internal tool).
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`https://i.ytimg.com/vi/${show.youtube_id}/default.jpg`}
                                alt=""
                                className="h-9 w-16 shrink-0 rounded object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="line-clamp-2 font-medium">{show.title ?? '—'}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                <span className="font-mono text-xs text-muted-foreground">
                                  #{show.id}
                                </span>
                                {!!show.hidden && (
                                  <Badge variant="warning">{t('label.hidden')}</Badge>
                                )}
                                {!!show.audiobook && (
                                  <Badge variant="secondary">{t('label.audiobook')}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{show.l2Code ?? '—'}</td>
                        {kind === 'tv_shows' ? (
                          <td className="px-3 py-2">{show.year ?? '—'}</td>
                        ) : (
                          <td className="px-3 py-2">{show.audiobook ? '✓' : '—'}</td>
                        )}
                        <td className="px-3 py-2">{show.avg_views ?? '—'}</td>
                        <td className="px-3 py-2">
                          {show.lex_div == null ? '—' : Number(show.lex_div).toFixed(4)}
                        </td>
                        <td className="px-3 py-2">
                          {show.status ? <Badge variant="secondary">{show.status}</Badge> : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void toggleEpisodes(show)}
                            >
                              {episodesLoading === show.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ListVideo className="h-4 w-4" />
                              )}
                              {t('title.episodes')}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={t('action.edit')}
                              onClick={() => {
                                setEditing(show);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={t('action.delete')}
                              onClick={() => setDeleting(show)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded === show.id && (
                        <tr className="border-t border-border bg-muted/20">
                          <td colSpan={7} className="px-3 py-3">
                            {episodesLoading === show.id ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('msg.loading')}
                              </div>
                            ) : (episodes[show.id]?.length ?? 0) === 0 ? (
                              <p className="text-sm text-muted-foreground">{t('msg.no_episodes')}</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {(episodes[show.id] ?? []).map((episode) => (
                                  <li
                                    key={episode.id}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      {episode.title ?? '—'}
                                    </span>
                                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span className="font-mono">{episode.youtube_id}</span>
                                      <span>
                                        {t('label.views')}: {episode.views ?? '—'}
                                      </span>
                                      <span>
                                        {t('label.difficulty')}:{' '}
                                        {episode.difficulty == null
                                          ? '—'
                                          : Number(episode.difficulty).toFixed(4)}
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ShowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={kind}
        show={editing}
        defaultL2={l2}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${t('action.delete')} ${noun}`}
        description={t('msg.confirm_delete_show', { kind: noun })}
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </AdminShell>
  );
}
