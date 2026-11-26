/**
 * Shapes returned by the SPEC-101 admin transactions endpoint
 * (`GET /admin/transactions` and `/admin/transactions/export`).
 */

export type TransactionProduct = 'monthly' | 'annual' | 'lifetime';
/**
 * `ledger` is the exact USD amount charged, read from the latest
 * `payment_events` payment for the subscription (coupon discounts included).
 * `regular` is the current price-list estimate used when no USD ledger payment
 * exists (pre-ledger history, or a non-USD charge).
 */
export type TransactionPriceSource = 'ledger' | 'regular' | 'unknown';
export type TransactionSort = 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc';
export type TransactionPlanFilter = 'all' | TransactionProduct;

export interface TransactionRow {
  id: number;
  /** `payment_date` when present, otherwise `created_on` (ISO timestamp). */
  date: string | null;
  purchaserName: string;
  purchaserEmail: string;
  product: TransactionProduct;
  /**
   * USD amount: the exact amount charged when `priceSource === 'ledger'`,
   * otherwise the regular-price estimate; null when the plan has no price row.
   */
  price: number | null;
  priceSource: TransactionPriceSource;
  currency: string;
  paymentProcessor: string | null;
  paymentMethod: string | null;
  paymentId: string | null;
  status: string | null;
}

export interface TransactionSummary {
  count: number;
  totalSales: number;
  averageSale: number;
  currency: string;
}

export interface TransactionPricing {
  currency: string;
  /** True while at least one filtered row is still a price-list estimate. */
  estimated: boolean;
  /** How many filtered rows were priced from the payment ledger. */
  ledgerCount: number;
  regular: Record<string, number>;
}

export interface TransactionPage {
  transactions: TransactionRow[];
  total: number;
  limit: number;
  offset: number;
  summary: TransactionSummary;
  pricing: TransactionPricing;
}

export interface TransactionFilters {
  q: string;
  plan: TransactionPlanFilter;
  /** ISO `YYYY-MM-DD`, or empty for no bound. */
  from: string;
  to: string;
  sort: TransactionSort;
  limit: number;
  offset: number;
}
