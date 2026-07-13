'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { LanguageSwitcher } from './language-switcher';
import { UserMenu } from './user-menu';
import { Play, Menu, X, ChevronDown } from 'lucide-react';

interface NavGroup {
  label: string;
  links: { key: string; href: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Media',
    links: [
      { key: 'title.explore', href: 'explore' },
      { key: 'title.tv_shows', href: 'tv-shows' },
      { key: 'title.watch_history', href: 'watch-history' },
    ],
  },
  {
    label: 'Vocab',
    links: [
      { key: 'title.dictionary', href: 'dictionary' },
      { key: 'title.saved_words', href: 'saved-words' },
    ],
  },
] as const;

function NavDropdown({ group, l1Code, l2Code }: { group: NavGroup; l1Code: string; l2Code: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="flex items-center gap-0.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {group.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-card p-1 shadow-lg"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {group.links.map((link) => (
            <Link
              key={link.href}
              href={`/${l1Code}/${l2Code}/${link.href}`}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
          {NAV_GROUPS.map((group) => (
            <NavDropdown
              key={group.label}
              group={group}
              l1Code={l1.code}
              l2Code={l2.code}
            />
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
            <nav className="flex flex-col gap-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.links.map((link) => (
                      <Link
                        key={link.href}
                        href={`/${l1.code}/${l2.code}/${link.href}`}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {t(link.key)}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
