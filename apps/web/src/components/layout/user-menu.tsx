'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { User, LogOut, Settings, Info, BookOpen, LogIn } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

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

  if (status === 'loading') {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!session?.user) {
    return (
      <Popover>
        <PopoverTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-label={t('action.log_in')}>
          <User className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" sideOffset={8} className="w-56 p-1">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <LogIn className="h-4 w-4" /> {t('action.log_in')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/docs`}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <BookOpen className="h-4 w-4" /> {t('title.docs')}
          </Link>
          <Link
            href="/about"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Info className="h-4 w-4" /> {t('title.about')}
          </Link>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20">
        {session.user.name?.charAt(0)?.toUpperCase() ?? session.user.email?.charAt(0)?.toUpperCase() ?? '?'}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" sideOffset={8} className="w-56 p-1">
        <Link
          href={`/${l1.code}/${l2.code}/profile`}
          className="block border-b border-border px-3 py-2 hover:bg-muted transition-colors"
        >
          <p className="text-sm font-medium truncate">{session.user.name ?? session.user.email}</p>
          <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
        </Link>
        <Link
          href={`/${l1.code}/${l2.code}/settings`}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <Settings className="h-4 w-4" /> {t('title.settings')}
        </Link>
        <Link
          href={`/${l1.code}/${l2.code}/docs`}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <BookOpen className="h-4 w-4" /> {t('title.docs')}
        </Link>
        <Link
          href="/about"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <Info className="h-4 w-4" /> {t('title.about')}
        </Link>
        <button
          onClick={() => { clearUserData(); signOut({ callbackUrl: '/' }); }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" /> {t('action.log_out')}
        </button>
      </PopoverContent>
    </Popover>
  );
}
