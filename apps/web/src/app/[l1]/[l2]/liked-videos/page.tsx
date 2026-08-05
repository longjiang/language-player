'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Heart,
  Loader2,
  Play,
} from 'lucide-react';
import type { LikedVideo, YouTubeVideo } from '@langplayer/shared';
import { useLanguage } from '@/providers/language-provider';
import { useUserLibraryContext } from '@/providers/user-library-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { youtubeThumbnail } from '@/lib/video-service';

function formatDate(date?: string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LikedVideosPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const l2Code = baseCode(l2.code);
  const {
    loaded,
    isSignedIn,
    getLikedVideos,
    unlikeVideo,
  } = useUserLibraryContext();
  const { playVideo } = useVideoPlayer();

  const liked = getLikedVideos(l2Code);

  const handlePlay = (item: LikedVideo, index: number) => {
    const queue: YouTubeVideo[] = liked.map((like) => ({
      youtube_id: like.youtube_id,
      id: String(like.id),
      title: like.title,
    }));
    playVideo(queue[index]!, queue, 'recommended');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/${l1.code}/${l2.code}/profile`}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('title.profile')}
      </Link>
      <h1 className="mb-6 flex items-center gap-2 text-3xl font-bold">
        <Heart className="h-7 w-7 fill-current text-destructive" />
        {t('title.liked_videos')}
      </h1>

      {!isSignedIn ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Heart className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.not_authenticated')}</p>
          <Link href="/login" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            {t('action.log_in')}
          </Link>
        </div>
      ) : !loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : liked.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Heart className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.no_liked_videos')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {liked.map((item, index) => (
            <div
              key={`${item.id}-${item.youtube_id}`}
              className="group flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <button
                type="button"
                onClick={() => handlePlay(item, index)}
                className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-muted"
                aria-label={t('a11y.play')}
              >
                <img
                  src={youtubeThumbnail(item.youtube_id)}
                  alt=""
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                  loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                  <Play className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" fill="white" />
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary transition-colors">
                  {item.title ?? t('label.untitled_video')}
                </h3>
                {(item.created_on ?? item.createdOn) && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(item.created_on ?? item.createdOn)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void unlikeVideo(item)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                aria-label={t('action.unlike_video')}
                title={t('action.unlike_video')}
              >
                <Heart className="h-4 w-4 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
