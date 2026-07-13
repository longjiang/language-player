'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { LanguageSwitcher } from './language-switcher';
import { UserMenu } from './user-menu';
import { Play, Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { key: 'title.explore', href: 'explore' },
  { key: 'title.dictionary', href: 'dictionary' },
  { key: 'title.saved_words', href: 'saved-words' },
] as const;

export function Header() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <Link href={`/${l1.code}/${l2.code}`} className="flex items-center gap-2 font-bold">
          <Play className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t('title.app_name')}</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={`/${l1.code}/${l2.code}/${link.href}`}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* User menu */}
        <UserMenu />

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted md:hidden"
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed right-0 top-14 z-50 w-64 border-l border-border bg-background p-4 shadow-lg md:hidden" style={{ height: 'calc(100vh - 3.5rem)' }}>
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={`/${l1.code}/${l2.code}/${link.href}`}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t(link.key)}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
