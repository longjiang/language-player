'use client';

import { AppHeader } from '@/components/admin/app-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscriptionManager } from '@/components/users/subscription-manager';
import { AdminPrivilegeControl } from '@/components/users/admin-privilege';
import { useT } from '@/hooks/use-t';
import { fetchUserDetail } from '@/lib/admin-api';
import { formatDate, formatHours, formatSeconds, initials } from '@/lib/format';
import { logerr } from '@/lib/logger';
import type { UserDetail } from '@/types/admin';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, BookOpen, Clock, Loader2 } from 'lucide-react';

function planLabel(t: ReturnType<typeof useT>, plan: string | null): string {
  switch (plan) {
    case 'monthly':
      return t('subscription.monthly');
    case 'annual':
      return t('subscription.annual');
    case 'lifetime':
      return t('subscription.lifetime');
    case 'trial':
      return t('label.trial');
    default:
      return plan ?? t('label.free_user');
  }
}

function OverviewTab({ detail, onChanged }: { detail: UserDetail; onChanged: () => void }) {
  const t = useT();
  const { user, srs, settings, acquisition } = detail;
  const settingsKind = settings.settingsV2 ? 'v2' : settings.settingsClassic ? 'classic' : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('label.profile')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.email')}:</dt>
            <dd className="break-all">{user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.phone')}:</dt>
            <dd>{user.phone || t('label.none')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.user_id')}:</dt>
            <dd className="break-all font-mono text-xs">{user.id}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.directus_id')}:</dt>
            <dd className="font-mono text-xs">{user.directusId ?? t('label.none')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.created')}:</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.last_sign_in')}:</dt>
            <dd>{formatDate(user.lastSignInAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('label.acquisition_source')}:</dt>
            <dd>{acquisition?.source ?? t('label.none')}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user.isAdmin && <Badge variant="warning">{t('label.admin')}</Badge>}
            {detail.subscriptionSummary.hasActive ? (
              <Badge variant="success">{planLabel(t, detail.subscriptionSummary.plan)}</Badge>
            ) : (
              <Badge variant="secondary">{t('label.free_user')}</Badge>
            )}
            <AdminPrivilegeControl user={user} onChanged={onChanged} />
          </div>
        </CardContent>
      </Card>

      <SubscriptionManager
        userId={user.id}
        subscriptions={detail.subscriptions}
        onChanged={onChanged}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('label.srs_cards')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('label.daily_new_limit')}</span>
              <span>{srs.dailyNewLimit ?? t('label.none')}</span>
            </div>
            <div className="mt-1.5 flex justify-between gap-2">
              <span className="text-muted-foreground">{t('label.total_cards')}</span>
              <span>{srs.totalCards}</span>
            </div>
            {Object.keys(srs.byL2).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(srs.byL2).map(([l2, count]) => (
                  <Badge key={l2} variant="secondary">
                    {l2} · {count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('label.settings')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('label.settings')}</span>
              <span>
                {settingsKind
                  ? settingsKind === 'v2'
                    ? t('label.settings_v2')
                    : t('label.settings_classic')
                  : t('label.none')}
              </span>
            </div>
            {acquisition?.details != null && (
              <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-muted p-2 text-xs">
                {JSON.stringify(acquisition.details, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProgressTab({ detail }: { detail: UserDetail }) {
  const t = useT();
  const totalTime = detail.progress.reduce((sum, p) => sum + (p.timeMs ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('label.learning_progress')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {t('label.time_watched')}: {formatHours(totalTime / 3_600_000)}
          </span>
          <span className="text-muted-foreground">
            {t('label.languages')}: {detail.progress.length}
          </span>
        </div>
        {detail.progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t('label.l2')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('label.level')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('label.time_watched')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('label.weekly_hours')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.progress.map((entry) => (
                  <tr key={entry.l2}>
                    <td className="px-4 py-2.5 font-medium">{entry.l2}</td>
                    <td className="px-4 py-2.5">{entry.level ?? t('label.none')}</td>
                    <td className="px-4 py-2.5">{formatHours(entry.hours ?? (entry.timeMs ?? 0) / 3_600_000)}</td>
                    <td className="px-4 py-2.5">{entry.weeklyHours ?? t('label.none')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SavedWordsTab({ detail }: { detail: UserDetail }) {
  const t = useT();
  const { savedWords } = detail;
  if (savedWords.totalWords === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t('msg.no_data')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold">{savedWords.totalWords}</div>
            <div className="text-sm text-muted-foreground">{t('label.words')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold">{savedWords.totalInstances}</div>
            <div className="text-sm text-muted-foreground">{t('label.instances')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {savedWords.byL2.map(({ l2, count }) => (
                <Badge key={l2} variant="secondary">
                  {l2} · {count}
                </Badge>
              ))}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{t('label.languages')}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('label.recently_saved')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {savedWords.recent.map((word) => (
            <div key={`${word.l2}-${word.wordId}`} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{word.l2}</Badge>
                <span className="font-medium">{word.forms.slice(0, 4).join(' · ')}</span>
                <span className="text-xs text-muted-foreground">
                  {word.instances.length} {t('label.instances')}
                </span>
              </div>
              {word.instances.slice(0, 3).map((instance, i) => (
                <div key={i} className="mt-2 border-t border-border pt-2 text-sm">
                  {instance.context?.text && (
                    <p className="text-muted-foreground">{instance.context.text}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {instance.context?.videoTitle ??
                      instance.context?.textTitle ??
                      t('label.none')}
                    {instance.timestamp ? ` · ${formatDate(instance.timestamp)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab({ detail }: { detail: UserDetail }) {
  const t = useT();
  const { watchHistory, likes, playlists, notes, phrases, bookshelf, history } = detail;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            {t('label.watch_history')} ({watchHistory.total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {watchHistory.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
          ) : (
            <div className="space-y-2">
              {watchHistory.recent.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{entry.title ?? `#${entry.videoId}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.l2Code ?? ''} · {formatDate(entry.date)}
                    </div>
                  </div>
                  {entry.lastPosition != null && entry.duration ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatSeconds(entry.lastPosition)} / {formatSeconds(entry.duration)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('title.liked_videos')} ({likes.total})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {likes.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
            ) : (
              likes.recent.map((like, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{like.title ?? `#${like.videoId}`}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {like.l2Code ?? ''} · {formatDate(like.createdOn)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('title.playlists')} ({playlists.total})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {playlists.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
            ) : (
              playlists.items.map((playlist) => (
                <div key={playlist.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{playlist.title}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {playlist.videoCount} {t('label.videos')} · {playlist.l2 ?? ''}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('label.notes')} ({notes.total})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notes.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
            ) : (
              notes.recent.map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{note.title}</span>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {note.l2 ?? ''} · {formatDate(note.createdOn)}
                    </span>
                  </div>
                  {note.text && (
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{note.text}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('label.phrases')} ({phrases.total})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {phrases.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
            ) : (
              phrases.recent.map((phrase, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{phrase.phrase}</span>
                    {phrase.en && <span className="ml-2 text-muted-foreground">{phrase.en}</span>}
                  </div>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {phrase.l2} · {formatDate(phrase.date)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {t('label.bookshelf')} ({bookshelf.total})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bookshelf.total === 0 ? (
              <p className="text-sm text-muted-foreground">{t('msg.no_data')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(bookshelf.books as { title?: string; name?: string }[])
                  .slice(0, 20)
                  .map((book, i) => (
                    <Badge key={i} variant="secondary">
                      {book.title ?? book.name ?? `#${i + 1}`}
                    </Badge>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('label.history')} ({history.total})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {history.total === 0 ? (
              t('msg.no_data')
            ) : (
              <p>{t('label.history')}: {history.total}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const t = useT();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const params = useParams<{ id: string }>();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tRef = useRef(t);
  tRef.current = t;

  // On a hard refresh the NextAuth session (and therefore the token mirror in
  // SessionTokenMirror) isn't ready on the first render. Wait for it, or the
  // authenticated fetch fires with no Authorization header and 401s forever.
  const sessionUser = (session?.user as any) ?? null;
  const authReady =
    authStatus === 'authenticated' && typeof sessionUser?.accessToken === 'string';

  const load = useCallback(async () => {
    if (!userId || !authReady) return;
    setLoading(true);
    setError('');
    try {
      setDetail(await fetchUserDetail(userId));
    } catch (err) {
      logerr('user detail load failed', err);
      setError(
        err instanceof Error && err.message ? err.message : tRef.current('msg.failed_to_load_user'),
      );
    } finally {
      setLoading(false);
    }
  }, [userId, authReady]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('msg.loading')}
          </div>
        </main>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    // The proxy normally redirects here; render a safe error just in case.
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {t('error.general')}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          {t('action.back_to_search')}
        </Button>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('msg.loading')}
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && detail && (
          <>
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {initials(detail.user.firstName, detail.user.lastName, detail.user.email)}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold">
                  {`${detail.user.firstName} ${detail.user.lastName}`.trim() || detail.user.email}
                </h1>
                <p className="truncate text-sm text-muted-foreground">{detail.user.email}</p>
              </div>
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="flex-wrap">
                <TabsTrigger value="overview">{t('label.overview')}</TabsTrigger>
                <TabsTrigger value="progress">{t('label.learning_progress')}</TabsTrigger>
                <TabsTrigger value="saved">{t('title.saved_words')}</TabsTrigger>
                <TabsTrigger value="activity">{t('label.recent_activity')}</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <OverviewTab detail={detail} onChanged={() => void load()} />
              </TabsContent>
              <TabsContent value="progress">
                <ProgressTab detail={detail} />
              </TabsContent>
              <TabsContent value="saved">
                <SavedWordsTab detail={detail} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityTab detail={detail} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
