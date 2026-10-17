/**
 * Typed client for the SPEC-101 admin transactions routes.
 *
 * Uses `authenticatedFetch`, so the Supabase access token mirrored by
 * `SessionTokenMirror` is attached and Flask's blueprint-level admin guard
 * can verify the `app_metadata.is_admin` claim.
 */

import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { log, logerr } from '@/lib/logger';
import type { TransactionFilters, TransactionPage } from '@/types/transactions';

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

function buildParams(
  filters: TransactionFilters,
  timezone: string,
  paginate: boolean,
): URLSearchParams {
  const params = new URLSearchParams({ tz: timezone, sort: filters.sort });
  if (filters.q) params.set('q', filters.q);
  if (filters.plan !== 'all') params.set('plan', filters.plan);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (paginate) {
    params.set('limit', String(filters.limit));
    params.set('offset', String(filters.offset));
  }
  return params;
}

function logFilters(filters: TransactionFilters): Record<string, unknown> {
  return {
    plan: filters.plan,
    from: filters.from || null,
    to: filters.to || null,
    sort: filters.sort,
    limit: filters.limit,
    offset: filters.offset,
    qLength: filters.q.length,
  };
}

export async function fetchTransactions(
  filters: TransactionFilters,
  timezone: string,
  signal?: AbortSignal,
): Promise<TransactionPage> {
  const params = buildParams(filters, timezone, true);
  const url = `${PYTHON_API_URL}/admin/transactions?${params.toString()}`;
  log('transactions request', { ...logFilters(filters), timezone });

  const res = await authenticatedFetch(url, { signal });
  if (!res.ok) {
    const message = await readError(res);
    logerr('transactions request failed', { status: res.status, message });
    throw new Error(message || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as TransactionPage;
  log('transactions response', {
    total: data.total,
    rows: data.transactions?.length ?? 0,
    totalSales: data.summary?.totalSales,
  });
  return data;
}

export interface TransactionCsv {
  blob: Blob;
  filename: string;
}

export async function fetchTransactionsCsv(
  filters: TransactionFilters,
  timezone: string,
): Promise<TransactionCsv> {
  const params = buildParams(filters, timezone, false);
  const url = `${PYTHON_API_URL}/admin/transactions/export?${params.toString()}`;
  log('transactions CSV request', { ...logFilters(filters), timezone });

  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const message = await readError(res);
    logerr('transactions CSV failed', { status: res.status, message });
    throw new Error(message || `HTTP ${res.status}`);
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return {
    blob: await res.blob(),
    filename: match?.[1] ?? `transactions-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
