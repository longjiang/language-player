/**
 * Reconciliation of the local SRS deck against the authoritative server deck
 * (SPEC-066 §Storage & sync, mobile).
 *
 * `mergeSrsCards` keeps every local card, so a device whose SecureStore carries
 * cards the server never persisted (a stuck/cleared outbox op, a stale session)
 * ends up with an inflated deck and the new/again/review header counts diverge
 * from web — which is server-authoritative. `refreshFromCache` therefore drops
 * local-only cards after merging, keeping a card only when one of three things
 * is true:
 *
 * 1. the authoritative `GET /srs` deck contains it;
 * 2. unsynced local work exists for it (a pending/error `srs_card` outbox op);
 * 3. the server **confirmed a push for it this session**
 *    (`subscribeEntityConfirmed`).
 *
 * (3) exists because the reconcile re-runs on every pull — and the pull path
 * fires for this device's OWN acked writes, which `POST /sync/push` writes to
 * `user_sync_log` and the next pull hands back. The server deck snapshot is
 * captured once, at hydration, so any card minted afterwards (the review page's
 * auto-init) is absent from it while its outbox row is already gone; without (3)
 * such a card was dropped from local state on the next sync action and re-minted
 * by the auto-init, so the deck churned on every sync (and the re-minted "new"
 * card could overwrite the real server row).
 *
 * Pure so the rules are unit-testable — the hook that calls it is React- and
 * native-module-bound.
 */
import type { SrsFields } from '@langplayer/shared';

/** `${l2}::${wordId}` — matches the outbox `entity_id` / confirmed-key format. */
export function srsReconcileKey(l2: string, wordId: string): string {
  return `${l2}::${wordId}`;
}

export interface ReconcileSrsCardsInput {
  /** Local per-language card record, already merged with the entity cache. */
  localCards: Record<string, SrsFields>;
  /** Authoritative server deck for this language. `undefined`/`null` means the
   *  language's deck has not loaded yet — the cards are returned untouched so
   *  legitimate offline work is never dropped before hydration. */
  serverCards?: Record<string, unknown> | null;
  /** `l2::wordId` keys with a pending/error outbox op (unsynced local work). */
  outboxKeys: ReadonlySet<string>;
  /** `l2::wordId` keys the server confirmed this session. */
  confirmedKeys: ReadonlySet<string>;
}

export interface ReconcileSrsCardsResult {
  cards: Record<string, SrsFields>;
  /** Word ids dropped as stale server-absent local cards (for logging). */
  dropped: string[];
}

export function reconcileLocalSrsCards(
  l2: string,
  { localCards, serverCards, outboxKeys, confirmedKeys }: ReconcileSrsCardsInput,
): ReconcileSrsCardsResult {
  if (!serverCards) return { cards: localCards, dropped: [] };
  const cards: Record<string, SrsFields> = {};
  const dropped: string[] = [];
  for (const [id, card] of Object.entries(localCards)) {
    const key = srsReconcileKey(l2, id);
    if (serverCards[id] || outboxKeys.has(key) || confirmedKeys.has(key)) {
      cards[id] = card;
    } else {
      dropped.push(id);
    }
  }
  return { cards, dropped };
}
