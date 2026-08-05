'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/use-t';
import { CheckCircle } from 'lucide-react';

export default function EmailVerifiedPage() {
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/language-select');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h1 className="mt-4 text-2xl font-bold">{t('title.all_set')}</h1>
        <p className="mt-2 text-muted-foreground">{t('msg.redirecting_to_language_selection')}</p>
      </div>
    </main>
  );
}
