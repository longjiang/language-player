'use client';

import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { LanguageSwitcher } from './language-switcher';
import { UserMenu } from './user-menu';
import { Play } from 'lucide-react';

export function Header() {
  const { l1, l2 } = useLanguage();
  const t = useT();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <Link href={`/${l1.code}/${l2.code}`} className="flex items-center gap-2 font-bold">
          <Play className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t('title.app_name')}</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href={`/${l1.code}/${l2.code}/explore`}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('title.explore')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/dictionary`}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('title.dictionary')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/saved-words`}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('title.saved_words')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/settings`}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('title.settings')}
          </Link>
        </nav>

        <div className="flex-1" />

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
