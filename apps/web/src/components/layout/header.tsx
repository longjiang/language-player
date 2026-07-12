'use client';

import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { LanguageSwitcher } from './language-switcher';
import { UserMenu } from './user-menu';
import { Play } from 'lucide-react';

export function Header() {
  const { l1, l2 } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <Link href={`/${l1.code}/${l2.code}`} className="flex items-center gap-2 font-bold">
          <Play className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">Language Player</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href={`/${l1.code}/${l2.code}/explore`}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Explore
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/dictionary`}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Dictionary
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
