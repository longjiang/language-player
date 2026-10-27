'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { clearUserData } from '@/lib/user-data-wipe';

/**
 * Classic `/logout` landing page. A plain redirect would leave the NextAuth
 * session intact, so this page signs the user out before sending them to
 * `/login` (SPEC-071).
 */
export default function LogoutPage() {
  useEffect(() => {
    // Classic wipes local user data before logging out (SPEC-062); keep the
    // same behavior so the next user never inherits the previous session's
    // saved words/settings (SPEC-071).
    clearUserData();
    signOut({ callbackUrl: '/login' });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
