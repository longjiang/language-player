'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { User, LogOut, Settings } from 'lucide-react';

/** Nuke all user-specific localStorage keys on logout. */
function clearUserData() {
  const keys = ['zthSavedWords'];
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch {}
  }
}

export function UserMenu() {
  const { data: session, status } = useSession();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [open, setOpen] = useState(false);

  if (status === 'loading') {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        {t('action.log_in')}
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
      >
        {session.user.name?.charAt(0)?.toUpperCase() ?? session.user.email?.charAt(0)?.toUpperCase() ?? '?'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <Link
              href={`/${l1.code}/${l2.code}/profile`}
              className="block border-b border-border px-3 py-2 hover:bg-muted transition-colors"
              onClick={() => setOpen(false)}
            >
              <p className="text-sm font-medium truncate">{session.user.name ?? session.user.email}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/settings`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-4 w-4" /> {t('title.settings')}
            </Link>
            <button
              onClick={() => { clearUserData(); signOut({ callbackUrl: '/' }); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> {t('action.log_out')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
