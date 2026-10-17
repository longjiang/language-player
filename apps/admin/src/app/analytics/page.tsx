'use client';

import { SignupChart } from '@/components/analytics/signup-chart';
import { AdminShell } from '@/components/layout/admin-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import { browserTimeZone, fetchSignupAnalytics } from '@/lib/analytics-api';
import { formatChartDay } from '@/lib/chart';
import { log, logerr } from '@/lib/logger';
import { cn } from '@/lib/utils';
import {
  SIGNUP_RANGES,
  type SignupAnalytics,
  type SignupRange,
} from '@/types/analytics';
import { AlertCircle, Loader2, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

export default function AnalyticsPage() {
  const t = useT();
  const authReady = useAuthReady();
  const [range, setRange] = useState<SignupRange>('last_7_days');
  const [data, setData] = useState<SignupAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authReady) return undefined;

    const timezone = browserTimeZone();
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError('');

    async function load() {
      log('signup analytics load', { range, timezone });
      try {
        const result = await fetchSignupAnalytics(range, timezone, controller.signal);
        if (cancelled) return;
        setData(result);
        log('signup analytics loaded', {
          range,
          days: result.days.length,
          total: result.total,
          bestDay: result.bestDay,
        });
      } catch (err) {
        if (cancelled || (err as { name?: string })?.name === 'AbortError') return;
        logerr('signup analytics load failed', err);
        setData(null);
        setError(err instanceof Error ? err.message : t('error.general'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authReady, range, reloadKey, t]);

  const dimmed = loading && data !== null;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.signup_analytics')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('msg.signup_analytics_hint')}
          </p>
        </div>

        <Select value={range} onValueChange={(value) => setRange(value as SignupRange)}>
          <SelectTrigger className="w-44" aria-label={t('title.signup_analytics')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIGNUP_RANGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn(
          'mt-6 grid gap-3 transition-opacity sm:grid-cols-3',
          dimmed && 'opacity-60',
        )}
      >
        <Metric
          label={t('label.total_signups')}
          value={data ? formatCount(data.total) : '—'}
          hint={data ? `${formatChartDay(data.start)} – ${formatChartDay(data.end)}` : undefined}
        />
        <Metric
          label={t('label.daily_average')}
          value={
            data
              ? data.averagePerDay.toLocaleString('en', { maximumFractionDigits: 1 })
              : '—'
          }
        />
        <Metric
          label={t('label.best_day')}
          value={data?.bestDay ? formatCount(data.bestDay.count) : '—'}
          hint={data?.bestDay ? formatChartDay(data.bestDay.date) : undefined}
        />
      </div>

      {error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t('action.retry')}
          </Button>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {t('label.new_signups')}
          </CardTitle>
          {data && (
            <span className="text-xs text-muted-foreground">
              {formatChartDay(data.start)} – {formatChartDay(data.end)}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex h-72 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t('msg.loading')}
            </div>
          ) : data ? (
            <div className={cn('transition-opacity', dimmed && 'opacity-60')}>
              <SignupChart key={data.range} days={data.days} />
              {data.total === 0 && (
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {t('msg.no_signups_range')}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('msg.signups_exclude_imported')}{' '}
          {t('msg.signups_timezone', { timezone: data.timezone })}
        </p>
      )}
    </AdminShell>
  );
}
