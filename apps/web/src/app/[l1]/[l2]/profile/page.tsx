'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { youtubeThumbnail } from '@/lib/video-service';
import {
  User,
  Mail,
  Clock,
  BookOpen,
  Loader2,
  Play,
  ArrowRight,
} from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';

interface WatchHistoryItem {
  id: number;
  title?: string;
  youtube_id: string;
  duration?: number;
  date?: string;
  last_position?: number;
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const { l1, l2 } = useLanguage();
  const { getSavedWords } = useSavedWordsContext();
  const { playVideo } = useVideoPlayer();
  const t = useT();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const userName = session?.user?.name;

  // ── Watch history ──
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setHistoryLoading(true);

    fetch(`${PYTHON_API_URL}/user-watch-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, l2: baseCode(l2.code) }),
    })
      .then((res) => (res.status === 404 ? [] : res.ok ? res.json() : []))
      .then((data: WatchHistoryItem[]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = (Array.isArray(data) ? data : [])
          .filter((item) => {
            if (seen.has(item.youtube_id)) return false;
            seen.add(item.youtube_id);
            return true;
          })
          .slice(0, 5);
        setHistory(unique);
        setHistoryLoading(false);
      })
      .catch(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [userId, l2.code]);

  // ── Saved words ──
  const savedWords = useMemo(() => getSavedWords(l2.code).slice(0, 10), [getSavedWords, l2.code]);

  // ── Helpers ──
  const formatDuration = (d: number | string | undefined): string => {
    if (d == null || d === '') return '';
    let num: number;
    if (typeof d === 'string') {
      const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
      num = m ? (parseInt(m[1] ?? '0') * 3600 + parseInt(m[2] ?? '0') * 60 + parseFloat(m[3] ?? '0')) : parseFloat(d);
      if (isNaN(num)) return '';
    } else {
      num = d;
    }
    const mins = Math.floor(num / 60);
    const secs = Math.floor(num % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayHistory = (item: WatchHistoryItem) => {
    const queue: YouTubeVideo[] = history.map((i) => ({
      youtube_id: i.youtube_id,
      title: i.title,
      id: String(i.id),
      duration: i.duration,
    }));
    const video = queue.find((v) => v.youtube_id === item.youtube_id);
    if (video) playVideo(video, queue, 'recommended');
  };

  // ── Render ──
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Account */}
      <section className="mb-10">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{userName ?? 'User'}</h1>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {userEmail}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Watch History */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5 text-primary" />
              {t('title.watch_history')}
            </h2>
            {history.length > 0 && (
              <Link
                href={`/${l1.code}/${l2.code}/watch-history`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                See All <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No videos watched yet.
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handlePlayHistory(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 group"
                >
                  <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
                    <img
                      src={youtubeThumbnail(item.youtube_id)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                      <Play className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium group-hover:text-primary transition-colors">
                      {item.title ?? 'Untitled'}
                    </p>
                    {item.duration && (
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(item.duration)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Saved Words */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-5 w-5 text-primary" />
              {t('title.saved_words')}
            </h2>
            {savedWords.length > 0 && (
              <Link
                href={`/${l1.code}/${l2.code}/saved-words`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                See All <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {savedWords.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No words saved yet.
            </p>
          ) : (
            <div className="space-y-1">
              {savedWords.map((word) => (
                <Link
                  key={word.id}
                  href={`/${l1.code}/${l2.code}/dictionary/word/${encodeURIComponent(word.forms[0] ?? '')}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  {/* Word */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{word.forms[0] ?? '?'}</span>
                      {word.forms.length > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {word.forms.slice(1).join(', ')}
                        </span>
                      )}
                    </div>
                    {/* Context */}
                    {word.context.videoTitle && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <Play className="mr-1 inline h-3 w-3" />
                        {word.context.videoTitle}
                      </p>
                    )}
                    {word.context.text && !word.context.videoTitle && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {word.context.text}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
