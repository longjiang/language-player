'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import {
  clearSearchCache,
  getContentHealth,
  reindexNgram,
  runEmbeddings,
  type ContentHealth,
} from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import { Activity, Database, Loader2, RefreshCw, Tags, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * SPEC-106 — content health and the on-demand derived-data actions.
 *
 * The daily VPS cron does the background work; this page is the visibility and
 * escape hatch: drain one embedding batch, reindex missing n-gram rows, or
 * clear the subs-search cache immediately.
 */
export default function ContentHealthPage() {
  const t = useT();
  const authReady = useAuthReady();
  const [health, setHealth] = useState<ContentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'embeddings' | 'ngram' | 'cache' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getContentHealth();
      setHealth(data);
      log('content health loaded', data);
    } catch (err) {
      logerr('content health failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authReady) void load();
  }, [authReady, load]);

  async function run(kind: 'embeddings' | 'ngram' | 'cache') {
    setBusy(kind);
    try {
      if (kind === 'embeddings') {
        const result = await runEmbeddings(50);
        toast.success(t('msg.health_done', { processed: result.processed }));
      } else if (kind === 'ngram') {
        const result = await reindexNgram(100);
        toast.success(t('msg.health_done', { processed: result.processed }));
      } else {
        await clearSearchCache();
        toast.success(t('msg.health_cache_cleared'));
      }
      log('content health action', { kind });
      await load();
    } catch (err) {
      logerr('content health action failed', { kind, err });
      toast.error(t('msg.health_failed'));
    } finally {
      setBusy(null);
    }
  }

  const lastRun = health?.last_run;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Activity className="h-6 w-6" />
              {t('title.content_health')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('msg.health_scope_note')}
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading || !!busy}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('action.refresh')}
          </Button>
        </div>

        {error && (
          <Card>
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label={t('msg.health_pending_embeddings')}
            value={health?.pending_embeddings ?? '—'}
          />
          <Metric
            label={t('msg.health_failed_embeddings')}
            value={health?.failed_embeddings ?? '—'}
          />
          <Metric
            label={t('msg.health_missing_embeddings')}
            value={health?.missing_embeddings ?? '—'}
          />
          <Metric
            label={t('msg.health_missing_ngram')}
            value={health?.missing_ngram ?? '—'}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-1 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('msg.health_revision')}
              </p>
              <p className="text-sm text-foreground">
                {health?.revision
                  ? `${health.revision.rev} · ${formatDate(health.revision.updated_at)}`
                  : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('msg.health_last_run')}
              </p>
              {lastRun ? (
                <>
                  <p className="text-sm text-foreground">
                    {lastRun.kind} · {formatDate(lastRun.finished_at ?? lastRun.started_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('msg.health_run_summary', {
                      processed: lastRun.processed,
                      failed: lastRun.failed,
                    })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('msg.health_no_run')}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run('embeddings')} disabled={!!busy}>
            {busy === 'embeddings' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            {t('action.update_embeddings')}
          </Button>
          <Button variant="outline" onClick={() => void run('ngram')} disabled={!!busy}>
            {busy === 'ngram' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Tags className="mr-2 h-4 w-4" />
            )}
            {t('action.reindex_ngram')}
          </Button>
          <Button variant="outline" onClick={() => void run('cache')} disabled={!!busy}>
            {busy === 'cache' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {t('action.clear_search_cache')}
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
