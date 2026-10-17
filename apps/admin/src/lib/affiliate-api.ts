/**
 * Typed clients for SPEC-102 affiliate and coupon routes.
 *
 * Callers are split by surface: `/admin/*` routes require an admin, while
 * `/affiliate/*` routes derive the affiliate from the bearer token. The client
 * never sends an affiliate id for self-service calls.
 */

import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { log, logerr } from '@/lib/logger';
import type {
  AffiliateDashboard,
  AffiliateList,
  AffiliateProfile,
  AffiliateStatement,
  AffiliateStatementDetail,
  AffiliateTransactionsPage,
  Coupon,
  CouponList,
} from '@/types/affiliate';

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  label = 'affiliate request',
): Promise<T> {
  log(label, { method: init.method ?? 'GET', path });
  const res = await authenticatedFetch(`${PYTHON_API_URL}${path}`, init);
  if (!res.ok) {
    const message = await readError(res);
    logerr(`${label} failed`, { path, status: res.status, message });
    throw new Error(message || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ── Affiliate self-service ──────────────────────────────────────────────

export function fetchAffiliateMe(): Promise<AffiliateDashboard> {
  return request<AffiliateDashboard>('/affiliate/me', {}, 'affiliate me');
}

export function updateAffiliatePayouts(paypalEmail: string): Promise<AffiliateProfile> {
  return request<AffiliateProfile>(
    '/affiliate/me/payouts',
    jsonBody('PATCH', { paypalEmail }),
    'affiliate payouts',
  );
}

export function completeAffiliateOnboarding(
  paypalEmail?: string,
): Promise<AffiliateProfile> {
  return request<AffiliateProfile>(
    '/affiliate/me/complete-onboarding',
    jsonBody('POST', paypalEmail ? { paypalEmail } : {}),
    'affiliate onboarding',
  );
}

export function fetchAffiliateTransactions(params: {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
}): Promise<AffiliateTransactionsPage> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return request<AffiliateTransactionsPage>(
    `/affiliate/transactions?${query.toString()}`,
    {},
    'affiliate transactions',
  );
}

export function fetchAffiliateStatements(): Promise<{
  statements: AffiliateStatement[];
  total: number;
}> {
  return request('/affiliate/statements', {}, 'affiliate statements');
}

export function fetchAffiliateStatement(id: number): Promise<AffiliateStatementDetail> {
  return request(`/affiliate/statements/${id}`, {}, 'affiliate statement');
}

// ── Admin affiliates ────────────────────────────────────────────────────

export function fetchAffiliates(params: {
  q?: string;
  active?: boolean | null;
  limit?: number;
  offset?: number;
}): Promise<AffiliateList> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
  });
  if (params.q) query.set('q', params.q);
  if (params.active === true || params.active === false) {
    query.set('active', String(params.active));
  }
  return request<AffiliateList>(
    `/admin/affiliates?${query.toString()}`,
    {},
    'admin affiliates',
  );
}

export function fetchAdminAffiliate(
  userId: string,
): Promise<{ affiliate: AffiliateProfile | null }> {
  return request(`/admin/users/${encodeURIComponent(userId)}/affiliate`, {}, 'admin affiliate');
}

export function createAdminAffiliate(
  userId: string,
  commissionPercent: number,
): Promise<AffiliateProfile> {
  return request(
    `/admin/users/${encodeURIComponent(userId)}/affiliate`,
    jsonBody('POST', { commissionPercent }),
    'create affiliate',
  );
}

export function updateAdminAffiliate(
  userId: string,
  payload: { commissionPercent?: number; active?: boolean; paypalEmail?: string },
): Promise<AffiliateProfile> {
  return request(
    `/admin/users/${encodeURIComponent(userId)}/affiliate`,
    jsonBody('PATCH', payload),
    'update affiliate',
  );
}

export function fetchAdminStatements(params: {
  status?: string;
  affiliateId?: number;
}): Promise<{ statements: AffiliateStatement[]; total: number }> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.affiliateId) query.set('affiliateId', String(params.affiliateId));
  return request(
    `/admin/affiliates/statements?${query.toString()}`,
    {},
    'admin statements',
  );
}

export function generateAdminStatements(period: string): Promise<{ statements: unknown[] }> {
  return request(
    '/admin/affiliates/statements/generate',
    jsonBody('POST', { period }),
    'generate statements',
  );
}

export function payAdminStatement(
  id: number,
  paymentReference: string,
): Promise<{ success: boolean }> {
  return request(
    `/admin/affiliates/statements/${id}/pay`,
    jsonBody('POST', { paymentReference }),
    'pay statement',
  );
}

// ── Admin coupons ───────────────────────────────────────────────────────

export function fetchCoupons(params: {
  q?: string;
  active?: boolean | null;
  limit?: number;
  offset?: number;
}): Promise<CouponList> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
  });
  if (params.q) query.set('q', params.q);
  if (params.active === true || params.active === false) {
    query.set('active', String(params.active));
  }
  return request<CouponList>(`/admin/coupons?${query.toString()}`, {}, 'admin coupons');
}

export function createCoupon(payload: {
  code: string;
  internalName: string;
  discountType: 'percent' | 'amount';
  percentOff?: number;
  amountOffCents?: number;
  maxRedemptions: number;
  expiresAt: string;
}): Promise<Coupon> {
  return request('/admin/coupons', jsonBody('POST', payload), 'create coupon');
}

export function updateCoupon(
  id: number,
  payload: {
    internalName?: string;
    maxRedemptions?: number;
    expiresAt?: string;
    active?: boolean;
  },
): Promise<Coupon> {
  return request(`/admin/coupons/${id}`, jsonBody('PATCH', payload), 'update coupon');
}
