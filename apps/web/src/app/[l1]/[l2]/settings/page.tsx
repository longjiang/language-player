'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { SettingsListPanel } from './_components/SettingsListPanel';
import { Loader2 } from 'lucide-react';

const LG_BREAKPOINT = 1024;

export default function SettingsListPage() {
  const { l1, l2 } = useLanguage();
  const router = useRouter();
  const [isWide, setIsWide] = useState<boolean | null>(null);

  // Detect wide screen
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const check = () => setIsWide(mql.matches);
    check();
    mql.addEventListener('change', check);
    return () => mql.removeEventListener('change', check);
  }, []);

  // Redirect to Display detail on wide screens
  useEffect(() => {
    if (isWide) {
      router.replace(`/${l1.code}/${l2.code}/settings/display`);
    }
  }, [isWide, l1.code, l2.code, router]);

  // Show spinner while checking width or redirecting on wide
  if (isWide === null || isWide) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <SettingsListPanel />
    </div>
  );
}
