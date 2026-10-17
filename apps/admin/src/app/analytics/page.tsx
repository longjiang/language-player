'use client';

import { MetricChart } from '@/components/analytics/metric-chart';
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
import { fetchAnalytics } from '@/lib/analytics-api';
import { formatChartDay } from '@/lib/chart';
import { log, logerr } from '@/lib/logger';
import { browserTimeZone } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import {
  ANALYTICS_METRICS,
  SIGNUP_RANGES,
  type AnalyticsMetric,
  type AnalyticsSeries,
  type SignupRange,
} from '@/types/analytics';
import { AlertCircle, DollarSign, Loader2, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const t = useT();
  const authReady = useAuthReady();
  const [metric, setMetric] = useState<AnalyticsMetric>('signups');
  const [range, setRange] = useState<SignupRange>('last_7_days');
  const [data, setData] = useState<AnalyticsSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authReady) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);

    async function load() {
      const timezone = browserTimeZone();
      log('analytics load', { metric, range, timezone });
      try {
        const result = await fetchAnalytics(metric, range, timezone, controller.signal);
        if (cancelled) return;
        setData(result);
        log('analytics loaded', {
          metric: result.metric,
          range: result.range,
          days: result.days.length,
          total: result.total,
          bestDay: result.bestDay,
        });
      } catch (err) {
        if (cancelled || (err as { name?: string })?.name === 'AbortError') return;
        logerr('analytics load failed', err);
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
  }, [authReady, metric, range, reloadKey, t]);

  const isRevenue = metric === 'revenue';
  const metricLabel = isRevenue ? t('label.revenue') : t('label.new_signups');
  const MetricIcon = isRevenue ? DollarSign : TrendingUp;
  const totalLabel = isRevenue ? t('label.total_revenue') : t('label.total_signups');
  const formatValue = isRevenue ? formatUsd : formatCount;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.analytics')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {isRevenue ? t('msg.revenue_hint') : t('msg.signup_analytics_hint')}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('label.metric')}
            </span>
            <Select value={metric} onValueChange={(value) => setMetric(value as AnalyticsMetric)}>
              <SelectTrigger aria-label={t('label.metric')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYTICS_METRICS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('label.range')}
            </span>
            <Select value={range} onValueChange={(value) => setRange(value as SignupRange)}>
              <SelectTrigger aria-label={t('label.range')}>
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
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric
          label={totalLabel}
          value={data ? formatValue(data.total) : '—'}
          hint={data ? `${formatChartDay(data.start)} – ${formatChartDay(data.end)}` : undefined}
        />
        <Metric
          label={t('label.daily_average')}
          value={
            data
              ? isRevenue
                ? formatUsd(data.averagePerDay)
                : data.averagePerDay.toLocaleString('en', { maximumFractionDigits: 1 })
              : '—'
          }
        />
        <Metric
          label={t('label.best_day')}
          value={data?.bestDay ? formatValue(data.bestDay.value) : '—'}
          hint={data?.bestDay ? formatChartDay(data.bestDay.date) : undefined}
        />
      </div>

      {error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            {t('action.retry')}
          </Button>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MetricIcon className="h-4 w-4 text-muted-foreground" />
            {metricLabel}
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
            <div className={cn('transition-opacity', loading && 'opacity-60')}>
              <MetricChart
                key={`${data.metric}-${data.range}`}
                days={data.days}
                metric={data.metric}
              />
              {data.total === 0 && (
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {isRevenue ? t('msg.no_revenue_range') : t('msg.no_signups_range')}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data && (
        <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
          {isRevenue ? t('msg.revenue_note') : t('msg.signups_exclude_imported')}{' '}
          {t('msg.signups_timezone', { timezone: data.timezone })}
        </p>
      )}
    </AdminShell>
  );
}
