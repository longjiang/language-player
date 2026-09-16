/**
 * Last-confirmed subscription record, cached per user (SPEC-053).
 *
 * `GET /user-subscription` is a network round-trip, so it fails whenever the
 * device is offline, Offline Mode is on, or the backend hiccups. A failed check
 * must never be read as "this user has no subscription" — it must leave the
 * subscription the user already had in place. This module owns the single
 * SecureStore record that makes that possible.
 *
 * Only an authoritative server answer writes here: a subscription record, or an
 * explicit "no subscription" (which clears it). Logout deletes it
 * (`lib/user-data-wipe.ts`), and the stored `userId` must match the signed-in
 * user or the record is ignored — so one account's plan can never leak into
 * another's session.
 */

import * as SecureStore from 'expo-secure-store';
import { logwarn } from '@/lib/logger';
import type { SubscriptionRecord } from '@langplayer/shared';

/** Fixed key (single record) so the logout wipe can delete it without enumerating. */
export const SUBSCRIPTION_CACHE_KEY = 'lp_subscription_cache';

interface CachedSubscription {
  userId: string;
  sub: SubscriptionRecord;
  cachedAt: number;
}

/** The cached record for this user, or null when there is none / it is unreadable. */
export async function readCachedSubscription(
  userId: string | undefined | null,
): Promise<SubscriptionRecord | null> {
  if (!userId) return null;
  try {
    const raw = await SecureStore.getItemAsync(SUBSCRIPTION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSubscription;
    if (!parsed || parsed.userId !== userId) return null;
    return parsed.sub && typeof parsed.sub === 'object' && parsed.sub.id ? parsed.sub : null;
  } catch (e) {
    // A corrupted record is a real error worth a stack trace, and it must not
    // take the subscription down with it (SPEC-053).
    logwarn('[subscription] cached record unreadable', e);
    return null;
  }
}

/** Persist the server-confirmed record, or clear it when the server says free. */
export async function writeCachedSubscription(
  userId: string | undefined | null,
  sub: SubscriptionRecord | null,
): Promise<void> {
  if (!userId) return;
  try {
    if (sub) {
      const payload: CachedSubscription = { userId, sub, cachedAt: Date.now() };
      await SecureStore.setItemAsync(SUBSCRIPTION_CACHE_KEY, JSON.stringify(payload));
    } else {
      await SecureStore.deleteItemAsync(SUBSCRIPTION_CACHE_KEY);
    }
  } catch (e) {
    // Non-fatal: the in-memory value still serves this session.
    logwarn('[subscription] could not persist the cached record', e);
  }
}
