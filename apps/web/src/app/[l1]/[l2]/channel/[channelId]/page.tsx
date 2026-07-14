'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { VideoGrid } from '@/components/video/video-grid';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { languageName, baseCode } from '@/lib/language-data';
import type { YouTubeVideo } from '@langplayer/shared';

interface ChannelInfo {
  title: string;
  thumbnail: string;
}

interface ChannelResponse {
  channel: ChannelInfo | null;
  videos: YouTubeVideo[];
  hasMore: boolean;
}

export default function ChannelPage() {
  const params = useParams<{ channelId: string }>();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const channelId = decodeURIComponent(params.channelId);

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const fetchVideos = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('l2', baseCode(l2.code));
        params.set('page', String(pageNum));
        params.set('page_size', '24');

        const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}?${params}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);

        const data: ChannelResponse = await res.json();
        if (!append && data.channel) setChannel(data.channel);
        setVideos((prev) => (append ? [...prev, ...data.videos] : data.videos));
        setHasMore(data.hasMore);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load channel videos');
      } finally {
        setLoading(false);
      }
    },
    [channelId, l2.code],
  );

  useEffect(() => {
    setPage(1);
    setVideos([]);
    fetchVideos(1, false);
  }, [fetchVideos]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVideos(nextPage, true);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Channel header */}
      {channel && (
        <div className="mb-8 flex items-center gap-4 rounded-xl border border-border bg-card p-6">
          <img
            src={channel.thumbnail || 'https://www.youtube.com/favicon.ico'}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
          <div>
            <h1 className="text-2xl font-bold">{channel.title}</h1>
            <a
              href={`https://www.youtube.com/channel/${channelId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              View on YouTube ↗
            </a>
          </div>
        </div>
      )}

      {loading && !channel && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Loading — first page */}
      {loading && videos.length === 0 && channel && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <div className="aspect-video animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && videos.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/30 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => fetchVideos(1)}>Try Again</Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && videos.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No videos found in this channel.</p>
        </div>
      )}

      {/* Video grid */}
      {videos.length > 0 && (
        <>
          <VideoGrid videos={videos} queueType="recommended" />

          {hasMore && (
            <div className="mt-8 text-center">
              <Button variant="outline" onClick={loadMore} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
