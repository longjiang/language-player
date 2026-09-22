'use client';

import { useEffect, useState } from 'react';
import { isSaleWindowOpen, saleWindowEnd, saleWindowStart } from '@langplayer/shared';

/**
 * How often to re-evaluate the window while the page stays open. The sale
 * boundaries are wall-clock instants, so a tab left open across midnight must
 * flip without a reload.
 */
const RECHECK_MS = 60_000;

export interface SaleWindowState {
  /** True only while the device's local clock is inside the sale window. */
  open: boolean;
  /** Last instant of the sale, in the device's local timezone. Only render
   *  this when `open` is true — see the SSR note below. */
  endsAt: Date;
  /** First instant of the sale, in the device's local timezone. */
  startsAt: Date;
}

/**
 * Resolve the sale window against the user's device clock.
 *
 * ⚠️ The window is resolved in an effect, never during the first render. A
 * `'use client'` component is still server-rendered, and `new Date()` on the
 * server yields the *server's* timezone (UTC in production) — so seeding state
 * from the render pass would render "sale open" in the server HTML and
 * "sale closed" after hydration (or vice versa) for anyone whose local date
 * differs from UTC. Starting closed keeps server HTML and the first client
 * render identical, and the effect opens the sale one frame later.
 *
 * Parity note: Classic gates the same way but has no SSR pass to worry about —
 * `zerotohero-nuxt/components/Sale.vue` binds its module-level
 * `SALE` constant directly, which is local-time on the client. See ADR-0048.
 */
export function useSaleWindow(): SaleWindowState {
  // Server HTML and first client render agree: sale closed.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setOpen(isSaleWindowOpen());
    update();
    const id = setInterval(update, RECHECK_MS);
    return () => clearInterval(id);
  }, []);

  return { open, endsAt: saleWindowEnd(), startsAt: saleWindowStart() };
}

/**
 * Format a sale date for display in the user's interface language.
 * `toLocaleDateString` with the L1 code is the app's existing convention
 * (see `liked-videos/page.tsx`), and the same formatted string is passed to
 * `msg.sale_offer_ends` as its `{date}` parameter so month/day order follows
 * the locale rather than a hardcoded English pattern.
 */
export function formatSaleDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
