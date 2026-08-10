'use client';

import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';

export function AppHeader() {
  const t = useT();
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">{t('title.admin_console')}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          {t('action.sign_out')}
        </Button>
      </div>
    </header>
  );
}
