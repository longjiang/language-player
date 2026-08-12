'use client';

import { useEffect } from 'react';
import { V2_ORIGIN } from '@/lib/classic-route-redirect';

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
 * wrapper on the Classic app by sending it to v2.languageplayer.io.
 */
export function CapacitorRedirect() {
  useEffect(() => {
    if (!isIosCapacitor()) return;
    window.location.replace(`${V2_ORIGIN}${window.location.pathname}${window.location.search}`);
  }, []);

  return null;
}
