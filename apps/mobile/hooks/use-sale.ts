import { useEffect, useState } from 'react';
import { isSaleWindowOpen, saleWindowEnd, saleWindowStart } from '@langplayer/shared';

/**
 * How often to re-evaluate the window while the app stays open. The sale
 * boundaries are wall-clock instants, so a session that spans midnight must
 * flip without a restart.
 */
const RECHECK_MS = 60_000;

export interface SaleWindowState {
  /** True only while the device's local clock is inside the sale window. */
  open: boolean;
  /** Last instant of the sale, in the device's local timezone. */
  endsAt: Date;
  /** First instant of the sale, in the device's local timezone. */
  startsAt: Date;
}

/**
 * Resolve the sale window against the user's device clock.
 *
 * Native has no server render, so unlike the web `useSaleWindow()` there is no
 * SSR mismatch to avoid — but the window is still resolved in an effect rather
 * than during render so the initial state matches the first paint for every
 * mount, and so a device whose clock crosses a boundary mid-session updates.
 *
 * Parity: Classic binds a module-level `SALE` constant
 * (`zerotohero-nuxt/lib/utils/variables.js`), which is evaluated once at bundle
 * load and is therefore stale in a long-lived session. This re-checks instead.
 * See ADR-0048.
 */
export function useSaleWindow(): SaleWindowState {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setOpen(isSaleWindowOpen());
    update();
    const id = setInterval(update, RECHECK_MS);
    return () => clearInterval(id);
  }, []);

  return { open, endsAt: saleWindowEnd(), startsAt: saleWindowStart() };
}

/** Format a sale date for display in the user's interface language, matching
 *  the app's existing `toLocaleDateString(locale, {...})` convention. The same
 *  string is passed to `msg.sale_offer_ends` as its `{date}` parameter so
 *  month/day order follows the locale. */
export function formatSaleDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
