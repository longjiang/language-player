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

import * as InAppPurchases from 'expo-in-app-purchases';
import { Platform } from 'react-native';

/** Product ID — must match App Store Connect.
 *  Same ID ("pro") the Nuxt app has been using since 2023.
 *  This lets existing users restore their purchase from the old app. */
const IOS_IAP_PRODUCT_ID = 'pro';

// ── Types ──

export interface PurchaseResult {
  /** The InAppPurchase object from the App Store. */
  purchase: InAppPurchases.InAppPurchase;
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
    await InAppPurchases.connectAsync();
    _connectionState = 'connected';
  } catch (err) {
    console.warn('[IAP] connect failed:', err);
    _connectionState = 'error';
    throw err;
  }
}

/** Disconnect from the payment queue. */
export async function disconnectIap(): Promise<void> {
  if (!IAP_AVAILABLE || _connectionState === 'disconnected') return;
  try {
    await InAppPurchases.disconnectAsync();
  } finally {
    _connectionState = 'disconnected';
  }
}

// ── Purchase Listener ──

type PurchaseCallback = (result: PurchaseResult) => void;
type ErrorCallback = (errorCode: InAppPurchases.IAPErrorCode | undefined) => void;

let _purchaseCallback: PurchaseCallback | null = null;
let _errorCallback: ErrorCallback | null = null;

/** Set the global purchase listener.
 *  Must be called once after connectAsync, before any purchase. */
export function setPurchaseHandler(
  onPurchase: PurchaseCallback,
  onError?: ErrorCallback,
): void {
  _purchaseCallback = onPurchase;
  _errorCallback = onError ?? null;

  InAppPurchases.setPurchaseListener(
    ({ responseCode, results, errorCode }: InAppPurchases.IAPQueryResponse<InAppPurchases.InAppPurchase>) => {
      if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
        for (const purchase of results) {
          if (purchase.productId === IOS_IAP_PRODUCT_ID && !purchase.acknowledged) {
            const receipt = purchase.transactionReceipt;
            if (receipt) {
              _purchaseCallback?.({ purchase, receipt });
            }
          }
        }
      } else if (
        responseCode === InAppPurchases.IAPResponseCode.ERROR ||
        responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED
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
  await InAppPurchases.purchaseItemAsync(IOS_IAP_PRODUCT_ID);
}

// ── Finish Transaction ──

/** Finish a completed purchase transaction.
 *  Must be called AFTER the backend has confirmed receipt validation. */
export async function finishPurchaseTransaction(
  purchase: InAppPurchases.InAppPurchase,
): Promise<void> {
  if (!IAP_AVAILABLE) return;
  try {
    await InAppPurchases.finishTransactionAsync(purchase, false);
  } catch (err) {
    console.warn('[IAP] finishTransactionAsync failed:', err);
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
    const { responseCode, results } =
      await InAppPurchases.getPurchaseHistoryAsync();

    if (responseCode !== InAppPurchases.IAPResponseCode.OK || !results) {
      return [];
    }

    // Find all "pro" purchases with receipts
    return results
      .filter((p): p is InAppPurchases.InAppPurchase =>
        p.productId === IOS_IAP_PRODUCT_ID && !!p.transactionReceipt,
      )
      .map((p) => ({
        purchase: p,
        receipt: p.transactionReceipt!,
      }));
  } catch (err) {
    console.warn('[IAP] restore failed:', err);
    return [];
  }
}
