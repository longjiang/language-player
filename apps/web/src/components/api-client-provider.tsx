'use client';

import { useEffect, useRef } from 'react';
import { createApiClient } from '@langplayer/api-client';

/**
 * Initializes the shared API client on mount.
 * In a real app, getAccessToken would read from cookies / localStorage / NextAuth.
 */
export function ApiClientProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    createApiClient({
      baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5001',
      timeout: 15000,
      async getAccessToken() {
        // TODO: Integrate with NextAuth or your auth provider
        return null;
      },
      onError(error) {
        console.error('[API]', error.code, error.message);
      },
    });
  }, []);

  return <>{children}</>;
}
