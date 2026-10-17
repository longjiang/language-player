/** SPEC-102 affiliate/coupon shapes shared by the admin and affiliate surfaces. */

export interface AffiliateMetrics {
  lifetimeSalesCents: number;
  lifetimeEarningsCents: number;
  pendingEarningsCents: number;
  last7SalesCents: number;
  last30SalesCents: number;
}

export interface AffiliateProfile {
  id: number;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  code: string;
  commissionBps: number;
  commissionPercent: number;
  active: boolean;
  paypalEmail: string;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metrics?: AffiliateMetrics;
  linkAttributionDays?: number;
  primaryLink?: string;
  signupLink?: string;
}

export interface AffiliateDashboard extends AffiliateProfile {
  linkAttributionDays: number;
  primaryLink: string;
  signupLink: string;
  metrics: AffiliateMetrics;
}

export interface AffiliateTransaction {
  id: number;
  date: string | null;
  saleCents: number;
  currency: string;
  rateBps: number;
  commissionCents: number;
  status: string;
  product: string;
}

export interface AffiliateTransactionsPage {
  transactions: AffiliateTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface AffiliateStatement {
  id: number;
  affiliateId: number;
  affiliateCode?: string;
  periodStart: string;
  periodEnd: string;
  statementNumber: string;
  status: 'pending' | 'paid' | 'void';
  totalCents: number;
  currency: string;
  paypalEmail: string;
  paidAt: string | null;
  paymentReference: string;
}

export interface AffiliateStatementDetail extends AffiliateStatement {
  items: {
    id: number;
    date: string | null;
    processor: string;
    saleCents: number;
    rateBps: number;
    commissionCents: number;
    status: string;
    product: string;
  }[];
}

export interface AffiliateList {
  affiliates: AffiliateProfile[];
  total: number;
  summary: {
    activeAffiliates: number;
    totalEarningsCents: number;
    totalSalesCents: number;
    averageSalesCents: number;
  };
}

export interface Coupon {
  id: number;
  code: string;
  internalName: string;
  discountType: 'percent' | 'amount';
  percentOff: number | null;
  amountOffCents: number;
  currency: string;
  appliesTo: string;
  duration: string;
  maxRedemptions: number;
  used: number;
  reserved: number;
  remaining: number;
  expiresAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CouponList {
  coupons: Coupon[];
  total: number;
}
