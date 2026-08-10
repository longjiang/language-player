'use client';

import { AppHeader } from '@/components/admin/app-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { searchUsers } from '@/lib/admin-api';
import { formatDate, formatHours, initials } from '@/lib/format';
import { logerr } from '@/lib/logger';
import type { AdminUserSummary } from '@/types/admin';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search, SearchX } from 'lucide-react';

function PlanBadge({ user }: { user: AdminUserSummary }) {
  const t = useT();
  if (user.isAdmin) return <Badge variant="warning">{t('label.admin')}</Badge>;
  if (user.subscriptions.hasActive) {
    return <Badge variant="success">{t('label.pro')}</Badge>;
  }
  return <Badge variant="secondary">{t('label.free_user')}</Badge>;
}

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

function ResultRow({ user }: { user: AdminUserSummary }) {
  const t = useT();
  const router = useRouter();
  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const plan = user.subscriptions.hasActive
    ? planLabel(t, user.subscriptions.plan)
    : t('label.free_user');

  return (
    <button
      type="button"
      onClick={() => router.push(`/users/${encodeURIComponent(user.id)}`)}
      className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {initials(user.firstName, user.lastName, user.email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <PlanBadge user={user} />
          {user.subscriptions.hasActive && (
            <Badge variant="outline">{plan}</Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">{user.email}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            {t('title.saved_words')}: {user.savedWordsCount}
          </span>
          <span>
            {t('label.watch_history')}: {user.watchHistoryCount}
          </span>
          <span>
            {t('label.hours')}: {formatHours(user.totalHours)}
          </span>
          <span>
            {t('label.created')}: {formatDate(user.createdAt)}
          </span>
        </div>
      </div>
      {user.subscriptions.expiresOn && (
        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          <div>{t('label.expires')}</div>
          <div>{formatDate(user.subscriptions.expiresOn)}</div>
        </div>
      )}
    </button>
  );
}

export default function DashboardPage() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUserSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    try {
      setResults(await searchUsers(trimmed));
    } catch (err) {
      logerr('user search failed', err);
      setResults(null);
      setError(t('error.general'));
    } finally {
      setLoading(false);
    }
  }

  const hasSearched = results !== null;
  const summary = useMemo(() => {
    if (!results) return null;
    const pro = results.filter((u) => u.subscriptions.hasActive).length;
    const admins = results.filter((u) => u.isAdmin).length;
    return { total: results.length, pro, admins };
  }, [results]);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">{t('title.user_management')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('msg.search_users_hint')}</p>

        <form
          className="mt-5 flex max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('placeholder.search_users')}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t('action.search')}
          </Button>
        </form>

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

        {!loading && hasSearched && results.length === 0 && (
          <Card className="mt-8">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <SearchX className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{t('msg.no_users_found')}</p>
              <p className="text-sm text-muted-foreground">{query}</p>
            </CardContent>
          </Card>
        )}

        {!loading && results && results.length > 0 && (
          <div className="mt-6">
            {summary && (
              <p className="mb-3 text-xs text-muted-foreground">
                {summary.total} {t('label.users')} · {summary.pro} {t('label.pro')} · {summary.admins}{' '}
                {t('label.admins')}
              </p>
            )}
            <div className="space-y-2">
              {results.map((user) => (
                <ResultRow key={user.id} user={user} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
