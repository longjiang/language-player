'use client';

import { useEffect } from 'react';
import { log } from '@/lib/logger';

interface CapacitorGlobal {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

function isIosCapacitor(): boolean {
  if (typeof window === 'undefined') return false;

  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!capacitor) return false;

  // Capacitor injects getPlatform() into the webview; on iOS it reports "ios".
  if (typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() === 'ios') {
    return true;
  }

  // Older Capacitor runtimes may only expose isNativePlatform().
  return (
    typeof capacitor.isNativePlatform === 'function' &&
    capacitor.isNativePlatform() &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

/**
 * The legacy "Language Player 2" iOS app is a Capacitor wrapper pointed at
 * languageplayer.io. When apps/web takes over that domain, keep the native
 * wrapper on the Classic app by proxying the origin to v2.languageplayer.io.
 *
 * Netlify proxies every request carrying the lp_legacy cookie to
 * v2.languageplayer.io (status 200), so the redirect stays inside the
 * webview. A cross-origin location.replace(v2...) would instead be cancelled
 * by Capacitor's navigation policy and handed to Safari.
 */
export function CapacitorRedirect() {
  useEffect(() => {
    if (!isIosCapacitor()) return;
    log('Capacitor iOS detected; setting lp_legacy cookie and reloading through the Netlify proxy');
    document.cookie =
      'lp_legacy=1; path=/; max-age=31536000; samesite=lax; secure';
    window.location.reload();
  }, []);

  return null;
}
