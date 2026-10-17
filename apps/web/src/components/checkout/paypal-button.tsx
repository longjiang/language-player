'use client';

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logerr } from '@/lib/logger';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: Record<string, unknown>) => {
        render: (target: HTMLElement) => Promise<void>;
        close?: () => void;
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

interface PayPalButtonProps {
  userId: string;
  amount: string;
  host: string;
  couponCode?: string;
  affiliateToken?: string | null;
  disabled?: boolean;
}

/**
 * PayPal Orders v2 checkout. The amount is a display hint only: Flask
 * recalculates it from the coupon reservation and refuses a mismatched legacy
 * amount. The success callback is the existing Flask handler, which captures
 * and verifies the order before granting Pro.
 */
export function PayPalButton({
  userId,
  amount,
  host,
  couponCode,
  affiliateToken,
  disabled,
}: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return;
    let cancelled = false;

    function renderButtons() {
      if (cancelled || !window.paypal || !containerRef.current || renderedRef.current) return;
      const buttons = window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 40 },
        createOrder: async () => {
          setError('');
          const res = await authenticatedFetch(`${PYTHON_API_URL}/create-paypal-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              host,
              amount,
              coupon_code: couponCode,
              affiliate_token: affiliateToken ?? undefined,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.id) {
            throw new Error(data?.error ?? 'Could not create the PayPal order');
          }
          return data.id;
        },
        onApprove: (data: { orderID?: string }) => {
          if (!data?.orderID) return;
          log('[LP Web] PayPal approved', { orderId: data.orderID });
          // Flask captures the order before redirecting back to this app; it is
          // an external backend URL, not a Next.js route.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `${PYTHON_API_URL}/paypal_checkout_success?order_id=${encodeURIComponent(data.orderID)}&user_id=${encodeURIComponent(userId)}&host=${encodeURIComponent(host)}`;
        },
        onCancel: () => setError('PayPal checkout was cancelled.'),
        onError: (err: unknown) => {
          logerr('[LP Web] PayPal checkout failed', err); // non-info-level: third-party checkout failure
          setError('PayPal checkout failed. Please try again.');
        },
      });
      buttons.render(containerRef.current).then(() => {
        renderedRef.current = true;
        setReady(true);
      }).catch((err: unknown) => {
        logerr('[LP Web] PayPal render failed', err); // non-info-level: SDK render failure
        setError('PayPal is unavailable right now.');
      });
    }

    if (window.paypal) {
      renderButtons();
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-lp-paypal]');
      if (existing) {
        existing.addEventListener('load', renderButtons, { once: true });
      } else {
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=USD&intent=capture&components=buttons`;
        script.async = true;
        script.dataset.lpPaypal = 'true';
        script.addEventListener('load', renderButtons, { once: true });
        script.addEventListener('error', () => setError('PayPal is unavailable right now.'), { once: true });
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [affiliateToken, amount, couponCode, host, userId]);

  if (!CLIENT_ID) return null;

  return (
    <div className="space-y-2">
      {!ready && !error && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} className={disabled ? 'pointer-events-none opacity-50' : ''} />
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  );
}
