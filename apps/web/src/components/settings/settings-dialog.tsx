'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { ArrowLeft, X } from 'lucide-react';
import { SettingsList } from '@/components/settings/settings-list';
import { SettingsDetail } from '@/components/settings/settings-detail';
import type { SettingsCategory } from '@/components/settings/settings-categories';

/** Matches Tailwind `md` — the app's small/large boundary (SPEC-052). */
const MD_BREAKPOINT = 768;

/**
 * Settings as a modal (ADR-0042).
 *
 * - narrow (< 768): small centered dialog, like the popup dictionary — the
 *   list first, then the category's detail with a back control.
 * - wide (>= 768): large modal, like the subs-search playback modal — category
 *   list + search as a left sidebar, detail on the right.
 *
 * Opening is always in place (no navigation); the `/[l1]/[l2]/settings/*`
 * routes render this same dialog so deep links open it on that category.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  initialCategory = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategory?: SettingsCategory | null;
}) {
  const t = useT();
  const [isMd, setIsMd] = useState<boolean | null>(null);
  const [category, setCategory] = useState<SettingsCategory | null>(initialCategory);

  // Client-only width probe: the first render matches SSR (null → nothing), so
  // there is no hydration mismatch when a deep-linked route opens the dialog.
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`);
    const check = () => setIsMd(mql.matches);
    check();
    mql.addEventListener('change', check);
    return () => mql.removeEventListener('change', check);
  }, []);

  // Every open starts from a known pane: the deep-linked category, else
  // Display on wide (sidebar visible) or the list on narrow.
  useEffect(() => {
    if (!open || isMd === null) return;
    setCategory(initialCategory ?? (isMd ? 'display' : null));
    log(`[LP Web] settings dialog opened category=${initialCategory ?? (isMd ? 'display' : 'list')} wide=${isMd}`);
  }, [open, initialCategory, isMd]);

  if (isMd === null) return null;

  const selectCategory = (key: SettingsCategory) => {
    setCategory(key);
    log(`[LP Web] settings dialog category=${key}`);
  };

  if (isMd) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 md:max-w-5xl"
        >
          <DialogTitle className="sr-only">{t('title.settings')}</DialogTitle>
          <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
            <aside className="flex min-h-0 flex-col border-r border-border">
              <SettingsList selectedKey={category} onSelect={selectCategory} />
            </aside>
            <div className="min-h-0 overflow-y-auto">
              <SettingsDetail category={category} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 w-[28rem] max-w-[90vw] sm:max-w-[28rem]"
      >
        <DialogTitle className="sr-only">{t('title.settings')}</DialogTitle>
        {category === null ? (
          <SettingsList selectedKey={null} onSelect={selectCategory} />
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t('action.back')}
                onClick={() => setCategory(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8"
                  aria-label={t('action.close')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SettingsDetail category={category} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
