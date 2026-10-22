'use client';

import { AppHeader } from '@/components/admin/app-header';
import { NAV_GROUPS, isActiveHref } from '@/components/layout/nav-items';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The admin console shell: the shared header plus the Insights / Users /
 * Content menu (SPEC-099/100). Every authenticated page renders this instead
 * of a bare `<AppHeader>` so every surface of the console is always reachable.
 *
 * Desktop shows a vertical sidebar; below `md` the same menu becomes a
 * horizontal, scrollable row so a phone can still navigate.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? '';

  function navItem(item: (typeof NAV_GROUPS)[number]['items'][number], horizontal = false) {
    const Icon = item.icon;
    const active = isActiveHref(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
          active
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          horizontal && 'px-3 py-1.5',
        )}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {t(item.labelKey)}
      </Link>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />

      {/* Mobile / narrow: one scrollable row per group. */}
      <nav className="border-b border-border bg-card/40 md:hidden">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2">
          {NAV_GROUPS.flatMap((group) => group.items).map((item) => navItem(item, true))}
        </div>
      </nav>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.labelKey}>
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.labelKey)}
                </p>
                <div className="space-y-0.5">{group.items.map((item) => navItem(item))}</div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
