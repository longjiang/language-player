'use client';

import { useEffect, useRef } from 'react';
import { createApiClient } from '@langplayer/api-client';
import { useSession } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * Initializes the shared API client with the Directus token
 * from the NextAuth session, so Flask /user-data endpoints can validate auth.
 * Re-creates the client when auth state changes (login/logout).
 */
export function ApiClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Wait until NextAuth has determined the session state
    if (status === 'loading') return;
    hasInitialized.current = true;

    createApiClient({
      baseURL: PYTHON_API_URL,
      timeout: 15000,
      async getAccessToken() {
        // Return the Directus JWT from the NextAuth session (stored in jwt callback)
        const token = (session?.user as any)?.directusToken as string | undefined;
        return token ?? null;
      },
      onError(error) {
        console.error('[API]', error.code, error.message);
      },
    });
  }, [session, status]);

  return <>{children}</>;
}
