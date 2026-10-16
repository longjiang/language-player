'use client';

import { useSession } from 'next-auth/react';

/**
 * True once the NextAuth session — and therefore the access token mirrored by
 * `SessionTokenMirror` — is available. On a hard refresh the first render has
 * no token, so an `authenticatedFetch` fired then goes out without an
 * `Authorization` header and Flask answers 401. Wait for this before loading.
 */
export function useAuthReady(): boolean {
  const { data: session, status } = useSession();
  const user = (session?.user as { accessToken?: unknown } | undefined) ?? null;
  return status === 'authenticated' && typeof user?.accessToken === 'string';
}
