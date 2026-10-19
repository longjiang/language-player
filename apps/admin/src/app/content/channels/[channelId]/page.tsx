'use client';

import { ConfirmDialog } from '@/components/content/confirm-dialog';
import { AdminShell } from '@/components/layout/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import { deleteChannel, getChannel, listChannelVideos } from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import type { AdminChannelDetail, ChannelVideo } from '@/types/content';
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Eye,
  Loader2,
  Trash2,
  Tv,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const PAGE_SIZE = 24;

/** Compact count for subscribers / views / uploads (admin has no l1 context). */
function compactNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(parsed);
}

function day(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** `duration` is stored as ISO 8601 (`PT3M12S`) or a raw second count. */
function duration(value: string | null | undefined): string {
  if (!value) return '';
  const iso = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  let seconds: number;
  if (iso) {
    seconds =
      Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
  } else {
    seconds = Number(value);
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function ChannelVideoCard({ video }: { video: ChannelVideo }) {
  const t = useT();
  const length = duration(video.duration);
  return (
    <a
      href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtube_id)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(video.youtube_id)}/mqdefault.jpg`}
          alt={t('a11y.video_thumbnail')}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {length && (
          <span className="absolute bottom-2 right-2 rounded bg-foreground/80 px-1.5 py-0.5 text-xs font-medium text-background">
            {length}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
          {video.title ?? t('label.untitled_video')}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {compactNumber(video.views)}
          </span>
          <span>{day(video.date)}</span>
        </div>
      </div>
    </a>
  );
}

export default function ChannelDetailPage() {
  const t = useT();
  const router = useRouter();
  const authReady = useAuthReady();
  const params = useParams<{ channelId: string }>();
  const rawChannelId = Array.isArray(params.channelId)
    ? params.channelId[0]
    : params.channelId;

  let channelId = rawChannelId ?? '';
  try {
    channelId = decodeURIComponent(channelId);
  } catch {
    // Keep the raw param; Flask will answer 404 for an unusable reference.
  }

  const [l2, setL2] = useState<string | null>(null);
  const [paramsReady, setParamsReady] = useState(false);

  const [detail, setDetail] = useState<AdminChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The L2 lives in the query string because a channel row is per-language.
  // Reading it in an effect avoids a `useSearchParams` Suspense boundary here.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('l2');
    setL2(value?.trim() || null);
    setParamsReady(true);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!authReady || !channelId || !l2) return;
    setLoading(true);
    setError('');
    log('channel detail load', { channelId, l2 });
    try {
      const data = await getChannel(channelId, l2);
      setDetail(data);
      log('channel detail loaded', {
        channelId,
        l2,
        storedVideoCount: data.stored_video_count,
      });
    } catch (err) {
      logerr('channel detail load failed', { channelId, l2, err });
      setDetail(null);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setLoading(false);
    }
  }, [authReady, channelId, l2, t]);

  const loadVideos = useCallback(
    async (page: number, append: boolean) => {
      if (!channelId || !l2) return;
      setVideosLoading(true);
      setVideosError('');
      log('channel videos load', { channelId, l2, page, append });
      try {
        const data = await listChannelVideos(channelId, l2, page, PAGE_SIZE);
        setVideos((previous) =>
          append ? [...previous, ...data.videos] : data.videos,
        );
        setVideoPage(page);
        setHasMore(data.hasMore && data.videos.length > 0);
        log('channel videos loaded', {
          channelId,
          l2,
          page,
          count: data.videos.length,
          hasMore: data.hasMore,
        });
      } catch (err) {
        logerr('channel videos load failed', { channelId, l2, page, err });
        setVideosError(err instanceof Error ? err.message : t('error.general'));
      } finally {
        setVideosLoading(false);
      }
    },
    [channelId, l2, t],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void loadVideos(1, false);
  }, [loadVideos]);

  async function confirmDelete() {
    if (!l2) return;
    setDeleting(true);
    log('channel delete requested', {
      channelId,
      l2,
      storedVideoCount: detail?.stored_video_count,
    });
    try {
      const result = await deleteChannel(channelId, l2);
      toast.success(t('msg.channel_deleted'));
      log('channel deleted', {
        channelId,
        l2,
        deletedVideos: result.deleted_videos,
      });
      setDeleteOpen(false);
      router.push(`/content/channels?l2=${encodeURIComponent(l2)}`);
      router.refresh();
    } catch (err) {
      logerr('channel delete failed', { channelId, l2, err });
      toast.error(err instanceof Error ? err.message : t('error.general'));
      setDeleteOpen(false);
      setDeleting(false);
    }
  }

  const backHref = l2
    ? `/content/channels?l2=${encodeURIComponent(l2)}`
    : '/content/channels';
  const importHref = l2
    ? `/content/import?mode=channel&l2=${encodeURIComponent(l2)}&channel=${encodeURIComponent(
        detail?.channel.channel_id ?? channelId,
      )}`
    : '/content/import';

  if (!paramsReady) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('msg.loading')}
        </div>
      </AdminShell>
    );
  }

  if (!l2) {
    return (
      <AdminShell>
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4" />
          {t('action.back')}
        </Button>
        <Card className="mt-4">
          <CardContent className="py-12 text-center">
            <p className="font-medium">{t('msg.choose_language_first')}</p>
          </CardContent>
        </Card>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push(backHref)}>
        <ArrowLeft className="h-4 w-4" />
        {t('title.channels')}
      </Button>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('msg.loading_channel')}
        </div>
      )}

      {!loading && error && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
          <Button variant="outline" onClick={() => void loadDetail()}>
            {t('action.try_again')}
          </Button>
        </div>
      )}

      {!loading && !error && detail && (
        <>
          <Card className="mt-3">
            <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row">
              {detail.channel.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.channel.thumbnail}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                  <Tv className="h-8 w-8" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold">
                      {detail.channel.title ?? detail.channel.channel_id}
                    </h1>
                    <a
                      href={`https://www.youtube.com/channel/${encodeURIComponent(
                        detail.channel.channel_id,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t('action.view_on_youtube')}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => router.push(importHref)}>
                      <Upload className="h-4 w-4" />
                      {t('action.import')}
                    </Button>
                    <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4" />
                      {t('action.delete_channel')}
                    </Button>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('label.channel_id')}</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs">
                      {detail.channel.channel_id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('label.subscribers')}</dt>
                    <dd className="mt-0.5">{compactNumber(detail.channel.subscribers)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('label.videos')}</dt>
                    <dd className="mt-0.5">{compactNumber(detail.channel.video_count)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('label.country')}</dt>
                    <dd className="mt-0.5">{detail.channel.country ?? '—'}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {t('msg.stored_videos_count', { count: detail.stored_video_count })}
                  </Badge>
                  {detail.channel.custom_url && (
                    <span className="text-xs text-muted-foreground">
                      {detail.channel.custom_url}
                    </span>
                  )}
                </div>

                {detail.channel.description && (
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {detail.channel.description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t('label.videos')}</h2>
            <Link
              href={importHref}
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {t('action.import')}
            </Link>
          </div>

          {videosLoading && videos.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t('msg.loading')}
            </div>
          )}

          {!videosLoading && videosError && videos.length === 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {videosError}
              </div>
              <Button variant="outline" onClick={() => void loadVideos(1, false)}>
                {t('action.try_again')}
              </Button>
            </div>
          )}

          {!videosLoading && !videosError && videos.length === 0 && (
            <Card className="mt-4">
              <CardContent className="py-12 text-center">
                <p className="font-medium">{t('msg.no_videos_found')}</p>
              </CardContent>
            </Card>
          )}

          {videos.length > 0 && (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map((video) => (
                  <ChannelVideoCard key={video.youtube_id} video={video} />
                ))}
              </div>

              <div className="mt-6 flex flex-col items-center gap-2">
                {hasMore ? (
                  <Button
                    variant="outline"
                    disabled={videosLoading}
                    onClick={() => void loadVideos(videoPage + 1, true)}
                  >
                    {videosLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('action.load_more')}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('msg.no_more_videos')}</p>
                )}
                {videosError && <p className="text-xs text-destructive">{videosError}</p>}
              </div>
            </>
          )}

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={t('action.delete_channel')}
            description={t('msg.confirm_delete_channel', {
              count: detail.stored_video_count,
            })}
            confirmLabel={t('action.delete_channel')}
            busy={deleting}
            onConfirm={() => void confirmDelete()}
          />
        </>
      )}
    </AdminShell>
  );
}
