// ──────────────────────────────────────────────
// In-App Purchase (IAP) — iOS only
// ──────────────────────────────────────────────
//
// Uses expo-iap (the maintained successor to expo-in-app-purchases /
// react-native-iap). Expo SDK 57 removed the legacy ObjC bridge
// (EXNativeModulesProxy) that expo-in-app-purchases relied on, so that
// package can no longer be reached from JS — see SPEC-054 Phase 3.
//
// Product ID "pro_go" matches the GO listing's existing App Store product.
// The new app replaces the GO listing (bundle ca.zerotohero.go), so it
// inherits the GO app's non-consumable product — NOT Classic's "pro", which
// belongs to ca.zerotohero.app.
// Backend: the Python IAP endpoint accepts receipts for BOTH public bundles
// (ca.zerotohero.go and ca.zerotohero.app), so purchases from this app and
// from Classic both validate. Canonical reference: SPEC-014 "Identifiers & IAP".
//
// Flow:
//   1. Connect to the store on mount (initConnection)
//   2. Register purchaseUpdatedListener / purchaseErrorListener
//   3. User taps "Buy" → requestPurchase({ request: { apple: { sku } } })
//   4. Purchase arrives via the listener; fetch the base64 App Store receipt
//      (getReceiptDataIOS) and pass both to the caller
//   5. POST receipt to Python backend for validation
//   6. On success → finishTransaction({ purchase, isConsumable: false })
//
// See docs/specs/014-subscription-payment-system.md Phase 5 for full spec.

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getReceiptDataIOS,
  requestReceiptRefreshIOS,
  getAvailablePurchases,
  requestPurchase,
  finishTransaction,
} from 'expo-iap';
import type { Purchase } from 'expo-iap';
import { logwarn } from '@/lib/logger';

/** Product ID — must match App Store Connect.
 *  "pro_go" is the GO listing's non-consumable product (shipped with the GO
 *  app). The new app keeps the GO bundle ID, so existing GO buyers can
 *  restore their purchase. Classic's "pro" belongs to ca.zerotohero.app. */
const IOS_IAP_PRODUCT_ID = 'pro_go';

// ── Types ──

export interface PurchaseResult {
  /** The Purchase object from the store (expo-iap). */
  purchase: Purchase;
  /** Best-effort legacy App Store receipt (StoreKit 2 often has none). */
  receipt?: string;
  /** StoreKit 2 signed transaction (JWS) — the backend's preferred proof. */
  jws?: string;
}

export type IapConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// ── State ──

/** Whether the module can be used on this platform. */
export const IAP_AVAILABLE = Platform.OS === 'ios';

let _connectionState: IapConnectionState = 'disconnected';

export function getConnectionState(): IapConnectionState {
  return _connectionState;
}

// ── Connection ──

/** Connect to the store.
 *  Must be called before any purchase/restore operations.
 *  Safe to call multiple times — returns immediately if already connected. */
export async function connectIap(): Promise<void> {
  if (!IAP_AVAILABLE || _connectionState === 'connected') return;
  _connectionState = 'connecting';
  try {
    await initConnection();
    _connectionState = 'connected';
  } catch (err) {
    logwarn('[IAP] connect failed:', err);
    _connectionState = 'error';
    throw err;
  }
}

/** Disconnect from the store. */
export async function disconnectIap(): Promise<void> {
  if (!IAP_AVAILABLE || _connectionState === 'disconnected') return;
  try {
    await endConnection();
  } finally {
    _connectionState = 'disconnected';
  }
}

// ── Purchase Listener ──

type PurchaseCallback = (result: PurchaseResult) => void;
type ErrorCallback = (errorCode: string | undefined) => void;

let _purchaseCallback: PurchaseCallback | null = null;
let _errorCallback: ErrorCallback | null = null;
let _purchaseSubscription: { remove: () => void } | null = null;
let _errorSubscription: { remove: () => void } | null = null;

/** Best-effort legacy App Store receipt.
 *
 *  This is ONLY used when a StoreKit 2 JWS is not available. Do NOT call
 *  `requestReceiptRefreshIOS()` when we already have the JWS — it runs
 *  `AppStore.sync()`, which re-prompts for the sandbox/production Apple ID
 *  password even after the purchase already succeeded (observed during
 *  SPEC-054 Phase 3 A2 testing). The backend prefers the JWS anyway, so the
 *  legacy receipt is purely a fallback for old StoreKit 1 paths. */
async function fetchAppStoreReceipt(jws?: string): Promise<string> {
  if (jws) return '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let receipt = await getReceiptDataIOS();
      if (receipt) return receipt;
      // RequestReceiptRefreshIOS calls AppStore.sync() then re-reads the file.
      receipt = await requestReceiptRefreshIOS();
      if (receipt) return receipt;
    } catch {
      // sync can throw (e.g. "Request Canceled"); retry, then fall back to JWS.
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  return '';
}

/** Set the global purchase/error listeners.
 *  Must be called once after connectIap, before any purchase. */
export async function setPurchaseHandler(
  onPurchase: PurchaseCallback,
  onError?: ErrorCallback,
): Promise<void> {
  _purchaseCallback = onPurchase;
  _errorCallback = onError ?? null;

  _purchaseSubscription?.remove();
  _errorSubscription?.remove();

  _purchaseSubscription = purchaseUpdatedListener((purchase: Purchase) => {
    if (purchase.productId !== IOS_IAP_PRODUCT_ID) return;
    // Restore validates + finishes these purchases itself — see
    // `_restoreInProgress` above.
    if (_restoreInProgress) return;
    const transactionId = purchase.transactionId;
    if (!transactionId) return;
    // Unfinished iOS transactions replay on every launch until finished —
    // ignore ones we've already surfaced to the caller.
    if (_handledTransactions.has(transactionId)) return;
    _handledTransactions.add(transactionId);

    void (async () => {
      // JWS (signed transaction) is the reliable proof from StoreKit 2;
      // the legacy receipt is best-effort for backward compatibility.
      const jws = purchase.purchaseToken ?? undefined;
      const receipt = await fetchAppStoreReceipt(jws);
      _purchaseCallback?.({ purchase, receipt: receipt || undefined, jws });
    })();
  });

  _errorSubscription = purchaseErrorListener((error) => {
    _errorCallback?.(error.code);
  });
}

/** Transaction ids already surfaced to the caller (avoid replay duplicates). */
const _handledTransactions = new Set<string>();

/** True while restorePurchases() is running. StoreKit may emit purchase
 *  updates for the restored transaction while the restore query is in
 *  flight; the restore loop validates those purchases itself, so the
 *  listener must not also surface them (that double-posts and pushes the
 *  success screen once per replay). */
let _restoreInProgress = false;

// ── Initiate Purchase ──

/** Initiate a lifetime "pro" purchase.
 *  The actual result arrives via the purchase listener set by `setPurchaseHandler`.
 *  `appAccountToken` binds the Apple transaction to the logged-in user so the
 *  backend can reject restore/claim attempts from other accounts. */
export async function initiatePurchase(userId: string): Promise<void> {
  if (!IAP_AVAILABLE) {
    throw new Error('IAP is not available on this platform');
  }
  await connectIap();
  await requestPurchase({
    request: { apple: { sku: IOS_IAP_PRODUCT_ID, appAccountToken: userId } },
    type: 'in-app',
  });
}

// ── Finish Transaction ──

/** Finish a completed purchase transaction.
 *  Must be called AFTER the backend has confirmed receipt validation. */
export async function finishPurchaseTransaction(purchase: Purchase): Promise<void> {
  if (!IAP_AVAILABLE) return;
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch (err) {
    logwarn('[IAP] finishTransaction failed:', err);
  }
}

// ── Restore ──

/** Restore previously purchased products.
 *  Returns the purchase objects for the "pro" product if found.
 *  Caller should validate the receipt via the backend and then finish the transaction. */
export async function restorePurchases(): Promise<PurchaseResult[]> {
  if (!IAP_AVAILABLE) return [];

  await connectIap();
  _restoreInProgress = true;

  try {
    const purchases = await getAvailablePurchases();
    const matches = purchases.filter((p) => p.productId === IOS_IAP_PRODUCT_ID);
    if (matches.length === 0) return [];

    const jws = matches[0]?.purchaseToken ?? undefined;
    const receipt = await fetchAppStoreReceipt(jws);
    return matches.map((purchase) => {
      const txnId =
        purchase.transactionId ?? purchase.id ?? purchase.purchaseToken;
      if (txnId) _handledTransactions.add(String(txnId));
      return {
        purchase,
        receipt: receipt || undefined,
        jws: purchase.purchaseToken ?? undefined,
      };
    });
  } catch (err) {
    logwarn('[IAP] restore failed:', err);
    return [];
  } finally {
    _restoreInProgress = false;
  }
}
