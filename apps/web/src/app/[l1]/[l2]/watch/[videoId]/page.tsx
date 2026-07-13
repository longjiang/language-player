'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { YouTubePlayer } from '@/components/video/youtube-player';
import { VideoMeta } from '@/components/video/video-meta';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import type { YouTubeVideo } from '@langplayer/shared';
import { AlertCircle, Loader2 } from 'lucide-react';
import { baseCode } from '@/lib/language-data';

export default function WatchPage() {
  const params = useParams<{ videoId: string }>();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const videoId = params.videoId;

  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Fetch video metadata on mount
  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}?l2=${baseCode(l2.code)}`);
        if (!res.ok) throw new Error('Video not found');
        const data = await res.json();
        setVideo(data);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load video');
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [videoId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">{t('msg.video_unavailable')}</h1>
        <p className="mt-2 text-muted-foreground">
          {error ?? t('msg.video_unavailable')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main: Player + Meta + Subtitles */}
        <div className="space-y-4">
          <YouTubePlayer
            youtubeId={video.youtube_id}
            autoplay
            onTimeUpdate={setCurrentTime}
          />
          <VideoMeta video={video} />
          <SubtitleDisplay youtubeId={video.youtube_id} currentTime={currentTime} />
        </div>

        {/* Sidebar: Up Next */}
        <aside className="hidden lg:block">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 font-semibold">{t('title.up_next')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('msg.related_videos')}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
