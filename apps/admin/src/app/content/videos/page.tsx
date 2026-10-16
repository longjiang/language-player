'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { ConfirmDialog } from '@/components/content/confirm-dialog';
import { L2Select } from '@/components/content/l2-select';
import { VideoDialog } from '@/components/content/video-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import { deleteVideo, listVideos, updateVideo, type VideoListParams } from '@/lib/content-api';
import { formatDate } from '@/lib/format';
import { log, logerr } from '@/lib/logger';
import type { AdminVideo } from '@/types/content';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  VideoOff,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type Assignment = 'all' | 'tv_show' | 'talk';

const SORT_OPTIONS = [
  { value: '-id', labelKey: 'sort.newest_id' },
  { value: '-date', labelKey: 'sort.newest' },
  { value: '-views', labelKey: 'sort.most_viewed' },
  { value: 'title', labelKey: 'sort.title' },
  { value: 'difficulty', labelKey: 'sort.easiest' },
  { value: '-difficulty', labelKey: 'sort.hardest' },
] as const;

export default function VideosPage() {
  const t = useT();
  const authReady = useAuthReady();

  const [l2, setL2] = useState<string | null>('en');
  const [query, setQuery] = useState('');
  const [pendingQuery, setPendingQuery] = useState('');
  const [assignment, setAssignment] = useState<Assignment>('all');
  const [sort, setSort] = useState<string>('-id');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminVideo | null>(null);
  const [deleting, setDeleting] = useState<AdminVideo | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkKind, setBulkKind] = useState<'tv_show' | 'talk'>('tv_show');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    setError('');
    const params: VideoListParams = {
      l2,
      q: query || null,
      sort,
      limit,
      offset,
      tvShowNotNull: assignment === 'tv_show',
      talkNotNull: assignment === 'talk',
    };
    log('videos load', params);
    try {
      const rows = await listVideos(params);
      setVideos(rows);
      setSelected(new Set());
      log('videos loaded', { count: rows.length, offset, limit });
    } catch (err) {
      logerr('videos load failed', err);
      setVideos([]);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setLoading(false);
    }
  }, [authReady, l2, query, sort, limit, offset, assignment, t]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const allSelected = videos.length > 0 && selected.size === videos.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(videos.map((v) => v.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteVideo(deleting.id);
      toast.success(t('msg.video_deleted'));
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      logerr('video delete failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    }
  }

  async function runBulkAssign(clear = false) {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    let done = 0;
    let failed = 0;
    log('bulk assign start', { kind: bulkKind, clear, count: ids.length, value: bulkValue });
    for (const id of ids) {
      try {
        await updateVideo(id, clear ? { [bulkKind]: null } : { [bulkKind]: bulkValue.trim() });
        done += 1;
      } catch (err) {
        failed += 1;
        logerr('bulk assign row failed', { id, err });
      }
    }
    setBulkBusy(false);
    log('bulk assign done', { done, failed });
    if (failed) toast.error(`${done} ok, ${failed} failed`);
    else toast.success(t('msg.bulk_updated', { count: done }));
    setSelected(new Set());
    setReloadKey((k) => k + 1);
  }

  async function runBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await deleteVideo(id);
        done += 1;
      } catch (err) {
        failed += 1;
        logerr('bulk delete row failed', { id, err });
      }
    }
    setBulkBusy(false);
    log('bulk delete done', { done, failed });
    if (failed) toast.error(`${done} ok, ${failed} failed`);
    else toast.success(t('msg.bulk_deleted', { count: done }));
    setBulkDeleting(false);
    setSelected(new Set());
    setReloadKey((k) => k + 1);
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('label.videos')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('msg.videos_admin_hint')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('action.new_video')}
        </Button>
      </div>

      <Card className="mt-5">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.language')}
              </span>
              <L2Select
                value={l2}
                allowAll
                className="w-full"
                onChange={(next) => {
                  setL2(next);
                  setOffset(0);
                }}
              />
            </div>

            <form
              className="flex min-w-[16rem] flex-1 items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setOffset(0);
                setQuery(pendingQuery.trim());
              }}
            >
              <div className="flex-1">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t('label.title')}
                </span>
                <Input
                  value={pendingQuery}
                  onChange={(e) => setPendingQuery(e.target.value)}
                  placeholder={t('placeholder.filter_by_title')}
                />
              </div>
              <Button type="submit" variant="outline">
                {t('action.search')}
              </Button>
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPendingQuery('');
                    setQuery('');
                    setOffset(0);
                  }}
                >
                  {t('action.clear')}
                </Button>
              )}
            </form>

            <div className="w-44">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.assignment')}
              </span>
              <Select
                value={assignment}
                onValueChange={(next) => {
                  setAssignment(next as Assignment);
                  setOffset(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('label.all')}</SelectItem>
                  <SelectItem value="tv_show">{t('title.tv_show')}</SelectItem>
                  <SelectItem value="talk">{t('label.talk')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-44">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('title.sort_by')}
              </span>
              <Select
                value={sort}
                onValueChange={(next) => {
                  setSort(next);
                  setOffset(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-28">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.page_size')}
              </span>
              <Select
                value={String(limit)}
                onValueChange={(next) => {
                  setLimit(Number(next));
                  setOffset(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[50, 100, 200].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {selected.size > 0 && (
        <Card className="mt-4 border-primary/40">
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <span className="text-sm font-medium">
              {t('msg.n_selected', { count: selected.size })}
            </span>
            <div className="w-40">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.assignment')}
              </span>
              <Select value={bulkKind} onValueChange={(v) => setBulkKind(v as 'tv_show' | 'talk')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tv_show">{t('title.tv_show')}</SelectItem>
                  <SelectItem value="talk">{t('label.talk')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('msg.show_or_talk_hint')}
              </span>
              <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              disabled={bulkBusy || !bulkValue.trim()}
              onClick={() => void runBulkAssign(false)}
            >
              {t('action.assign')}
            </Button>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => void runBulkAssign(true)}>
              {t('action.clear_assignment')}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => setBulkDeleting(true)}
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('action.delete')}
            </Button>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
              {t('action.clear_selection')}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('msg.loading')}
        </div>
      )}

      {!loading && videos.length === 0 && !error && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <VideoOff className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t('msg.no_videos_found')}</p>
          </CardContent>
        </Card>
      )}

      {!loading && videos.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={t('action.select_all')}
                  />
                </th>
                <th className="px-3 py-2">{t('label.title')}</th>
                <th className="px-3 py-2">{t('label.youtube_id')}</th>
                <th className="px-3 py-2">{t('label.level')}</th>
                <th className="px-3 py-2">{t('label.views')}</th>
                <th className="px-3 py-2">{t('label.difficulty')}</th>
                <th className="px-3 py-2">{t('label.status')}</th>
                <th className="px-3 py-2">{t('label.assignment')}</th>
                <th className="px-3 py-2">{t('title.date')}</th>
                <th className="px-3 py-2 text-right">{t('label.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(video.id)}
                      onChange={() => toggleOne(video.id)}
                      aria-label={video.title ?? String(video.id)}
                    />
                  </td>
                  <td className="max-w-[22rem] px-3 py-2">
                    <div className="line-clamp-2 font-medium">{video.title ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      #{video.id}
                      {video.lesson ? ` · ${t('label.lesson')} ${video.lesson}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {video.youtube_id ? (
                      <a
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="font-mono text-xs">{video.youtube_id}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">{video.level ?? '—'}</td>
                  <td className="px-3 py-2">{video.views ?? '—'}</td>
                  <td className="px-3 py-2">
                    {video.difficulty == null ? '—' : Number(video.difficulty).toFixed(4)}
                  </td>
                  <td className="px-3 py-2">
                    {video.status ? <Badge variant="secondary">{video.status}</Badge> : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {video.tv_show && <Badge variant="outline">{video.tv_show.title}</Badge>}
                      {video.talk && <Badge variant="outline">{video.talk.title}</Badge>}
                      {!video.tv_show && !video.talk && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(video.date ?? video.created_on)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('action.edit')}
                        onClick={() => {
                          setEditing(video);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('action.delete')}
                        onClick={() => setDeleting(video)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (videos.length > 0 || offset > 0) && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t('label.showing_range', { from: offset + 1, to: offset + videos.length })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              <ChevronLeft className="h-4 w-4" />
              {t('action.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={videos.length < limit}
              onClick={() => setOffset(offset + limit)}
            >
              {t('action.next')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <VideoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        video={editing}
        defaultL2={l2}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('action.delete')}
        description={t('msg.confirm_remove_video')}
        onConfirm={() => void confirmDelete()}
      />

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={t('action.delete')}
        description={t('msg.confirm_delete_videos', { count: selected.size })}
        busy={bulkBusy}
        onConfirm={() => void runBulkDelete()}
      />
    </AdminShell>
  );
}
