'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import { log, logerr } from '@/lib/logger';
import { browserTimeZone } from '@/lib/timezone';
import { fetchTransactions, fetchTransactionsCsv } from '@/lib/transactions-api';
import { cn } from '@/lib/utils';
import type {
  TransactionFilters,
  TransactionPage,
  TransactionPlanFilter,
  TransactionRow,
  TransactionSort,
} from '@/types/transactions';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Receipt,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const PAGE_SIZES = [10, 25, 50, 100] as const;

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function transactionDate(value: string | null): { day: string; time: string } {
  if (!value) return { day: '—', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: value, time: '' };
  return {
    day: date.toLocaleDateString('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    time: date.toLocaleTimeString('en', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
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

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground"
      onClick={onClick}
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export default function TransactionsPage() {
  const t = useT();
  const authReady = useAuthReady();

  const [query, setQuery] = useState('');
  const [pendingQuery, setPendingQuery] = useState('');
  const [plan, setPlan] = useState<TransactionPlanFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<TransactionSort>('date_desc');
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<TransactionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const filters: TransactionFilters = { q: query, plan, from, to, sort, limit, offset };

  useEffect(() => {
    if (!authReady) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError('');

    async function load() {
      log('transactions load', filters);
      try {
        const result = await fetchTransactions(filters, browserTimeZone(), controller.signal);
        if (cancelled) return;
        setData(result);
        log('transactions loaded', {
          total: result.total,
          rows: result.transactions.length,
          totalSales: result.summary.totalSales,
        });
      } catch (err) {
        if (cancelled || (err as { name?: string })?.name === 'AbortError') return;
        logerr('transactions load failed', err);
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
    // `filters` is rebuilt each render; the primitive fields below are the
    // actual dependencies, so a new object does not re-fire the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, query, plan, from, to, sort, limit, offset, reloadKey, t]);

  function clearFilters() {
    setPendingQuery('');
    setQuery('');
    setPlan('all');
    setFrom('');
    setTo('');
    setOffset(0);
  }

  function toggleDateSort() {
    setSort((current) => (current === 'date_desc' ? 'date_asc' : 'date_desc'));
    setOffset(0);
  }

  function togglePriceSort() {
    setSort((current) => (current === 'price_desc' ? 'price_asc' : 'price_desc'));
    setOffset(0);
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const { blob, filename } = await fetchTransactionsCsv(filters, browserTimeZone());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      logerr('transactions CSV export failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setExporting(false);
    }
  }

  function productLabel(product: TransactionRow['product']): string {
    switch (product) {
      case 'monthly':
        return t('plan.monthly');
      case 'annual':
        return t('plan.annual');
      case 'lifetime':
        return t('plan.lifetime');
      default:
        return product;
    }
  }

  function processorLabel(processor: string | null): string {
    switch (processor) {
      case 'stripe':
        return t('payment.stripe');
      case 'paypal':
        return t('payment.paypal');
      case 'app-store':
        return t('payment.apple_app_store');
      case 'other':
        return t('payment.other');
      default:
        return processor ?? '—';
    }
  }

  const hasFilters = Boolean(query || plan !== 'all' || from || to);
  const rows = data?.transactions ?? [];
  const showInitialLoading = loading && !data;
  const dateSortActive = sort === 'date_desc' || sort === 'date_asc';
  const priceSortActive = sort === 'price_desc' || sort === 'price_asc';

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.transactions')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('msg.transactions_hint')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void handleExport()}
          disabled={exporting || !authReady || !data?.total}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t('action.export_csv')}
        </Button>
      </div>

      <Card className="mt-5">
        <CardContent className="pt-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <Metric
              label={t('label.total_sales_est')}
              value={data ? formatUsd(data.summary.totalSales) : '—'}
              hint={
                data
                  ? `${data.summary.count.toLocaleString('en')} ${t('label.transactions')}`
                  : undefined
              }
            />
            <Metric
              label={t('label.transactions')}
              value={data ? data.summary.count.toLocaleString('en') : '—'}
            />
            <Metric
              label={t('label.average_sale')}
              value={data ? formatUsd(data.summary.averageSale) : '—'}
            />
          </div>

          <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
            {t('msg.transactions_estimate')}
          </p>

          <div className="my-5 border-t border-border" />

          <div className="flex flex-wrap items-end gap-3">
            <form
              className="flex min-w-[18rem] flex-1 items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(pendingQuery.trim());
                setOffset(0);
              }}
            >
              <div className="flex-1">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t('action.search')}
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={pendingQuery}
                    onChange={(event) => setPendingQuery(event.target.value)}
                    placeholder={t('placeholder.search_transactions')}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" variant="outline">
                {t('action.search')}
              </Button>
            </form>

            <div className="w-40">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.plan')}
              </span>
              <Select
                value={plan}
                onValueChange={(next) => {
                  setPlan(next as TransactionPlanFilter);
                  setOffset(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('label.all')}</SelectItem>
                  <SelectItem value="monthly">{t('plan.monthly')}</SelectItem>
                  <SelectItem value="annual">{t('plan.annual')}</SelectItem>
                  <SelectItem value="lifetime">{t('plan.lifetime')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-40">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.from')}
              </span>
              <Input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setOffset(0);
                }}
              />
            </div>

            <div className="w-40">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.to')}
              </span>
              <Input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setOffset(0);
                }}
              />
            </div>

            <div className="w-28">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.page_size')}
              </span>
              <Select
                value={String(limit)}
                onValueChange={(next) => {
                  setLimit(Number(next));
                  setOffset(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                {t('action.clear')}
              </Button>
            )}
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

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">
                    <SortButton
                      label={t('title.date')}
                      active={dateSortActive}
                      direction={sort === 'date_asc' ? 'asc' : 'desc'}
                      onClick={toggleDateSort}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">{t('label.purchaser')}</th>
                  <th className="px-3 py-2 font-medium">{t('label.product')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <SortButton
                      label={t('label.price_est')}
                      active={priceSortActive}
                      direction={sort === 'price_asc' ? 'asc' : 'desc'}
                      onClick={togglePriceSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {showInitialLoading && (
                  <tr>
                    <td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('msg.loading')}
                      </span>
                    </td>
                  </tr>
                )}

                {!showInitialLoading && rows.length === 0 && !error && (
                  <tr>
                    <td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">
                      <Receipt className="mx-auto mb-2 h-7 w-7" />
                      {t('msg.no_transactions')}
                    </td>
                  </tr>
                )}

                {rows.map((row) => {
                  const when = transactionDate(row.date);
                  const sale = row.priceSource === 'sale';
                  return (
                    <tr key={row.id} className="border-b border-border/70 align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-3">
                        <div>{when.day}</div>
                        {when.time && (
                          <div className="text-xs text-muted-foreground">{when.time}</div>
                        )}
                      </td>
                      <td className="max-w-[20rem] px-3 py-3">
                        <div className="truncate font-medium">
                          {row.purchaserName || row.purchaserEmail || '—'}
                        </div>
                        {row.purchaserName && row.purchaserEmail && (
                          <div className="truncate text-xs text-muted-foreground">
                            {row.purchaserEmail}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {productLabel(row.product)}
                          {row.status === 'active' && (
                            <Badge variant="success">{t('label.status_active')}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {processorLabel(row.paymentProcessor)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.price == null ? '—' : formatUsd(row.price)}
                          {sale && <Badge variant="warning">{t('label.sale')}</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data && data.total > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {t('label.showing_range', {
                  from: data.offset + 1,
                  to: Math.min(data.offset + data.transactions.length, data.total),
                })}
                {' · '}
                {data.total.toLocaleString('en')} {t('label.transactions')}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('action.previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= data.total}
                  onClick={() => setOffset(offset + limit)}
                >
                  {t('action.next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <p className={cn('mt-4 text-xs text-muted-foreground', !data && 'hidden')}>
            {t('msg.transactions_pricing_source', {
              count: data?.pricing.saleWindowCount ?? 0,
            })}
          </p>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
