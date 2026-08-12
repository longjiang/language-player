'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import {
  User,
  LogOut,
  Settings,
  Info,
  BookOpen,
  LogIn,
  History,
  ListVideo,
  Heart,
  Bookmark,
  Youtube,
} from 'lucide-react';
import { clearUserData } from '@/lib/user-data-wipe';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { AboutDialog } from '@/components/about/about-dialog';

export function UserMenu() {
  const { data: session, status } = useSession();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const close = () => setOpen(false);

  if (status === 'loading') {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!session?.user) {
    return (
      <>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-label={t('action.log_in')}>
            <User className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" sideOffset={8} className="w-56 p-1">
            <Link
              href="/login"
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <LogIn className="h-4 w-4" /> {t('action.log_in')}
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/docs`}
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <BookOpen className="h-4 w-4" /> {t('title.docs')}
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/watch-history`}
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <History className="h-4 w-4" /> {t('title.watch_history')}
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/playlists`}
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <ListVideo className="h-4 w-4" /> {t('title.playlists')}
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/liked-videos`}
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <Heart className="h-4 w-4" /> {t('title.liked_videos')}
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/my-channels`}
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <Youtube className="h-4 w-4" /> {t('title.my_channels')}
            </Link>
            <Link
              href={`/${l1.code}/${l2.code}/saved-words`}
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <Bookmark className="h-4 w-4" /> {t('title.saved_words')}
            </Link>
            <button
              type="button"
              onClick={() => { close(); setAboutOpen(true); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <Info className="h-4 w-4" /> {t('title.about')}
            </button>
          </PopoverContent>
        </Popover>
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20">
          {session.user.name?.charAt(0)?.toUpperCase() ?? session.user.email?.charAt(0)?.toUpperCase() ?? '?'}
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" sideOffset={8} className="w-56 p-1">
          <Link
            href={`/${l1.code}/${l2.code}/profile`}
            onClick={close}
            className="block border-b border-border px-3 py-2 hover:bg-muted transition-colors"
          >
            <p className="text-sm font-medium truncate">{session.user.name ?? session.user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/settings`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Settings className="h-4 w-4" /> {t('title.settings')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/watch-history`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <History className="h-4 w-4" /> {t('title.watch_history')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/playlists`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <ListVideo className="h-4 w-4" /> {t('title.playlists')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/liked-videos`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Heart className="h-4 w-4" /> {t('title.liked_videos')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/my-channels`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Youtube className="h-4 w-4" /> {t('title.my_channels')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/saved-words`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Bookmark className="h-4 w-4" /> {t('title.saved_words')}
          </Link>
          <Link
            href={`/${l1.code}/${l2.code}/docs`}
            onClick={close}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <BookOpen className="h-4 w-4" /> {t('title.docs')}
          </Link>
          <button
            type="button"
            onClick={() => { close(); setAboutOpen(true); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Info className="h-4 w-4" /> {t('title.about')}
          </button>
          <button
            onClick={() => { close(); clearUserData(); signOut({ callbackUrl: '/' }); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> {t('action.log_out')}
          </button>
        </PopoverContent>
      </Popover>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
