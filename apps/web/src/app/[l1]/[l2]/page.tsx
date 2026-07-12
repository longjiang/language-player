'use client';

import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { Play, BookOpen, Tv, Layers } from 'lucide-react';
import Link from 'next/link';

export default function LanguageDashboard() {
  const { l1, l2 } = useLanguage();
  const t = useT();

  const links = [
    { href: `/${l1.code}/${l2.code}/explore`, label: t('title.explore_media'), icon: Play, desc: t('msg.find_videos') },
    { href: `/${l1.code}/${l2.code}/dictionary`, label: t('title.dictionary'), icon: BookOpen, desc: t('msg.lookup_words') },
    { href: `/${l1.code}/${l2.code}/live-tv`, label: 'Live TV', icon: Tv, desc: t('msg.watch_live'), disabled: !l2.has.liveTV },
    { href: `/${l1.code}/${l2.code}/settings`, label: t('title.settings'), icon: Layers, desc: t('msg.customize_experience') },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Learning {l2.name} from {l1.name}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your dashboard for {l1.name} → {l2.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.disabled ? '#' : link.href}
            className={`rounded-xl border border-border p-6 transition-all ${
              link.disabled
                ? 'cursor-not-allowed opacity-40'
                : 'bg-card hover:border-primary/50 hover:shadow-md'
            }`}
            onClick={(e) => link.disabled && e.preventDefault()}
          >
            <link.icon className="mb-3 h-8 w-8 text-primary" />
            <h3 className="font-semibold">{link.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{link.desc}</p>
            {link.disabled && (
              <span className="mt-2 inline-block rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Coming soon
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
