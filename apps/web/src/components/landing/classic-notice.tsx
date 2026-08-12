'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { buttonVariants } from '@/components/ui/button';
import { V2_ORIGIN } from '@/lib/classic-route-redirect';

export function ClassicNotice() {
  const t = useT();

  return (
    <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center rounded-2xl border border-border bg-card/70 p-6">
      <p className="text-sm font-medium">{t('landing.classic_intro')}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t('landing.classic_desc')}</p>
      <Link
        href={V2_ORIGIN}
        target="_blank"
        rel="noopener noreferrer"
        className={`${buttonVariants({ variant: 'outline' })} mt-4 gap-3`}
      >
        <Image
          src="/img/v2-logo.png"
          alt={t('title.app_name')}
          width={28}
          height={28}
          className="h-7 w-7 rounded-full"
        />
        <span>{t('action.open_classic')}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
