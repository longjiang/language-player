// ──────────────────────────────────────────────
// In-App Purchase (IAP) — iOS only
// ──────────────────────────────────────────────
//
// Uses expo-in-app-purchases (Expo SDK 57+).
// Product ID "pro" matches the Nuxt Capacitor app's existing App Store listing.
//
// Flow:
//   1. Connect to the payment queue on mount
//   2. Fetch product details via getProductsAsync
//   3. Set purchase listener globally
//   4. User taps "Buy" → purchaseItemAsync("pro")
//   5. Purchase result arrives via the listener callback
//   6. POST receipt to Python backend for validation
//   7. On success → finishTransactionAsync(purchase, false)
//
// See docs/specs/014-subscription-payment-system.md Phase 5 for full spec.
//
// NOTE: expo-in-app-purchases is loaded lazily (dynamic import) because the
// native module is NOT available in Expo Go. A static top-level import would
// crash immediately with "Cannot find native module 'ExpoInAppPurchases'".

import { Platform } from 'react-native';
import type { InAppPurchase, IAPErrorCode, IAPQueryResponse, IAPResponseCode } from 'expo-in-app-purchases';
import { logwarn } from '@/lib/logger';

// ── Lazy module loader ──

type IapModule = typeof import('expo-in-app-purchases');

let _module: IapModule | null = null;
let _moduleLoadError: Error | null = null;

async function iap(): Promise<IapModule> {
  if (_module) return _module;
  if (_moduleLoadError) throw _moduleLoadError;
  try {
    _module = await import('expo-in-app-purchases');
    return _module;
  } catch (err: any) {
    _moduleLoadError = new Error(`Failed to load IAP module: ${err?.message ?? err}`);
    throw _moduleLoadError;
  }
}

/** Product ID — must match App Store Connect.
 *  Same ID ("pro") the Nuxt app has been using since 2023.
 *  This lets existing users restore their purchase from the old app. */
const IOS_IAP_PRODUCT_ID = 'pro';

// ── Types ──

export interface PurchaseResult {
  /** The InAppPurchase object from the App Store. */
  purchase: InAppPurchase;
  /** Base64-encoded App Store receipt. */
  receipt: string;
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

/** Connect to the App Store payment queue.
 *  Must be called before any purchase/restore operations.
 *  Safe to call multiple times — returns immediately if already connected. */
export async function connectIap(): Promise<void> {
  if (!IAP_AVAILABLE || _connectionState === 'connected') return;
  _connectionState = 'connecting';
  try {
    const m = await iap();
    await m.connectAsync();
    _connectionState = 'connected';
  } catch (err) {
    logwarn('[IAP] connect failed:', err);
    _connectionState = 'error';
    throw err;
  }
}

/** Disconnect from the payment queue. */
export async function disconnectIap(): Promise<void> {
  if (!IAP_AVAILABLE || _connectionState === 'disconnected') return;
  try {
    const m = await iap();
    await m.disconnectAsync();
  } finally {
    _connectionState = 'disconnected';
  }
}

// ── Purchase Listener ──

type PurchaseCallback = (result: PurchaseResult) => void;
type ErrorCallback = (errorCode: IAPErrorCode | undefined) => void;

let _purchaseCallback: PurchaseCallback | null = null;
let _errorCallback: ErrorCallback | null = null;

/** Set the global purchase listener.
 *  Must be called once after connectAsync, before any purchase. */
export async function setPurchaseHandler(
  onPurchase: PurchaseCallback,
  onError?: ErrorCallback,
): Promise<void> {
  _purchaseCallback = onPurchase;
  _errorCallback = onError ?? null;

  const m = await iap();
  m.setPurchaseListener(
    ({ responseCode, results, errorCode }: IAPQueryResponse<InAppPurchase>) => {
      if (responseCode === m.IAPResponseCode.OK && results) {
        for (const purchase of results) {
          if (purchase.productId === IOS_IAP_PRODUCT_ID && !purchase.acknowledged) {
            const receipt = purchase.transactionReceipt;
            if (receipt) {
              _purchaseCallback?.({ purchase, receipt });
            }
          }
        }
      } else if (
        responseCode === m.IAPResponseCode.ERROR ||
        responseCode === m.IAPResponseCode.USER_CANCELED
      ) {
        _errorCallback?.(errorCode);
      }
    },
  );
}

// ── Initiate Purchase ──

/** Initiate a lifetime "pro" purchase.
 *  The actual result arrives via the purchase listener set by `setPurchaseHandler`. */
export async function initiatePurchase(): Promise<void> {
  if (!IAP_AVAILABLE) {
    throw new Error('IAP is not available on this platform');
  }
  await connectIap();
  const m = await iap();
  await m.purchaseItemAsync(IOS_IAP_PRODUCT_ID);
}

// ── Finish Transaction ──

/** Finish a completed purchase transaction.
 *  Must be called AFTER the backend has confirmed receipt validation. */
export async function finishPurchaseTransaction(
  purchase: InAppPurchase,
): Promise<void> {
  if (!IAP_AVAILABLE) return;
  try {
    const m = await iap();
    await m.finishTransactionAsync(purchase, false);
  } catch (err) {
    logwarn('[IAP] finishTransactionAsync failed:', err);
  }
}

// ── Restore ──

/** Restore previously purchased products.
 *  Returns the purchase objects for the "pro" product if found.
 *  Caller should validate the receipt via the backend and then finish the transaction. */
export async function restorePurchases(): Promise<PurchaseResult[]> {
  if (!IAP_AVAILABLE) return [];

  await connectIap();

  try {
    const m = await iap();
    const { responseCode, results } =
      await m.getPurchaseHistoryAsync();

    if (responseCode !== m.IAPResponseCode.OK || !results) {
      return [];
    }

    // Find all "pro" purchases with receipts
    return results
      .filter((p): p is InAppPurchase =>
        p.productId === IOS_IAP_PRODUCT_ID && !!p.transactionReceipt,
      )
      .map((p) => ({
        purchase: p,
        receipt: p.transactionReceipt!,
      }));
  } catch (err) {
    logwarn('[IAP] restore failed:', err);
    return [];
  }
}
