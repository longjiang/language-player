'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LogIn } from 'lucide-react';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { Logo } from '@/components/ui/logo';
import { buttonVariants } from '@/components/ui/button';
import { getLastLanguagePair } from '@/lib/last-language-pair';
import { UserMenu } from './user-menu';

/**
 * Slim top bar for routes outside a language pair (landing, auth, language
 * selection, etc.). Language routes render the full Header instead.
 */
export function PublicHeader() {
  const pathname = usePathname();
  const t = useT();
  const { data: session, status } = useSession();
  const [languagePair, setLanguagePair] = useState<{ l1: string; l2: string } | null>(null);

  // User menu links need a language pair; use the last selected pair when
  // available, and a safe default before cookies are read on the client.
  useEffect(() => {
    const pair = getLastLanguagePair();
    if (pair) setLanguagePair(pair);
  }, []);

  const segments = pathname.split('/').filter(Boolean);
  const isLanguageRoute =
    segments.length >= 2 &&
    SUPPORTED_L1S.includes(segments[0] as any) &&
    SUPPORTED_L2S.includes(segments[1] as any);

  if (isLanguageRoute) return null;

  const l1Code = languagePair?.l1 ?? 'en';
  const l2Code = languagePair?.l2 ?? 'zh';

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Logo linkHref="/?landing=1" showText priority l1={l1Code} />

        <div className="flex-1" />

        {status === 'loading' ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : session?.user ? (
          <UserMenu l1Code={l1Code} l2Code={l2Code} />
        ) : (
          <Link href="/login" className={buttonVariants({ size: 'sm' })}>
            <LogIn className="h-4 w-4" />
            {t('action.log_in')}
          </Link>
        )}
      </div>
    </header>
  );
}
