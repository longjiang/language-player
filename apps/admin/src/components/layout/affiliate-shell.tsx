'use client';

import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  CircleHelp,
  LayoutDashboard,
  Link2,
  LogOut,
  Receipt,
  Wallet,
} from 'lucide-react';

const ITEMS = [
  { href: '/affiliate', labelKey: 'label.dashboard', icon: LayoutDashboard },
  { href: '/affiliate/links', labelKey: 'label.links', icon: Link2 },
  { href: '/affiliate/transactions', labelKey: 'label.transactions', icon: Receipt },
  { href: '/affiliate/statements', labelKey: 'label.statements', icon: BookOpen },
  { href: '/affiliate/payouts', labelKey: 'label.payouts', icon: Wallet },
  { href: '/affiliate/faq', labelKey: 'label.faq', icon: CircleHelp },
];

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/affiliate" className="text-sm font-semibold">
            {t('title.affiliate_program')}
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            {t('action.sign_out')}
          </Button>
        </div>
      </header>

      <nav className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
