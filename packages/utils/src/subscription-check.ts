/**
 * Interpreting one `GET /user-subscription` response (SPEC-053).
 *
 * Pure, dependency-free so it can be unit-tested without React Native: the
 * caller does the request, this module decides what the answer means.
 *
 * The distinction that matters: `sub` and `none` are authoritative server
 * answers, while `failed` means the check never really happened (offline,
 * Offline Mode, non-2xx, unparseable or unrecognized body). A `failed` check
 * must leave the last known subscription alone — a user with a lifetime or
 * unexpired plan never loses it because a request failed.
 */

import type { SubscriptionRecord } from '@langplayer/shared';

export type SubscriptionCheck =
  | { kind: 'sub'; sub: SubscriptionRecord }
  | { kind: 'none' }
  | { kind: 'failed'; reason: string };

/**
 * Classify a finished request. `status === 0` stands for "no response at all"
 * (the fetch threw: offline, Offline Mode, DNS/TLS failure).
 */
export function classifySubscriptionResponse(status: number, body: unknown): SubscriptionCheck {
  if (status === 0) return { kind: 'failed', reason: 'network' };
  if (status < 200 || status >= 300) return { kind: 'failed', reason: `http-${status}` };
  return parseSubscriptionBody(body);
}

/** Parse a 2xx body from `GET /user-subscription`. */
export function parseSubscriptionBody(body: unknown): SubscriptionCheck {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'failed', reason: 'unrecognized-body' };
  }
  const record = body as Record<string, unknown>;
  if (record.id) return { kind: 'sub', sub: record as unknown as SubscriptionRecord };
  // The endpoint answers `{"subscription": null}` when the user has none.
  // That (and nothing vaguer) is an authoritative "free".
  if ('subscription' in record) {
    const nested = record.subscription;
    if (nested === null) return { kind: 'none' };
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>;
      if (inner.id) return { kind: 'sub', sub: inner as unknown as SubscriptionRecord };
    }
  }
  return { kind: 'failed', reason: 'unrecognized-body' };
}
