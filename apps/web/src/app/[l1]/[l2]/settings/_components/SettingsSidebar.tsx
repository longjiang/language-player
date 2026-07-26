'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { Palette, Play, Mic, Repeat } from 'lucide-react';

interface SidebarItem {
  key: string;
  icon: typeof Palette;
  label: string;
  href: string;
}

export function SettingsSidebar() {
  const pathname = usePathname();
  const { l1, l2 } = useLanguage();
  const { display, playback, review } = useSettingsContext();
  const t = useT();

  const items: SidebarItem[] = useMemo(() => [
    { key: 'display', icon: Palette, label: t('title.display'), href: `/${l1.code}/${l2.code}/settings/display` },
    { key: 'playback', icon: Play, label: t('title.playback'), href: `/${l1.code}/${l2.code}/settings/playback` },
    { key: 'speech', icon: Mic, label: t('title.speech'), href: `/${l1.code}/${l2.code}/settings/speech` },
    { key: 'review', icon: Repeat, label: t('title.review'), href: `/${l1.code}/${l2.code}/settings/review` },
  ], [l1.code, l2.code, t]);

  return (
    <nav className="space-y-1">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
