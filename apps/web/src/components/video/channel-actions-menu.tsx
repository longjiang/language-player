'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Bell, BellOff, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { useChannelPreference } from '@/hooks/use-channel-preference';
import type { ChannelPref } from '@/hooks/use-channel-preference';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { useExploreCache } from '@/providers/explore-cache-provider';

interface ChannelActionsMenuProps {
  channelId: string;
}

/** Reusable "..." menu for channel subscribe/not-interested actions.
 *  Uses a portal to avoid clipping from parent overflow:hidden containers. */
export function ChannelActionsMenu({ channelId }: ChannelActionsMenuProps) {
  const t = useT();
  const { l2 } = useLanguage();
  const { clearL2 } = useExploreCache();
  const { pref, savePref } = useChannelPreference(channelId);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleSave = (status: ChannelPref) => {
    // Channel prefs change the recommendation feed — drop the cached
    // explore/music lists so the change shows up without a reload.
    clearL2(baseCode(l2.code));
    savePref(status);
  };

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [open]);

  return (
    <div className="flex-shrink-0">
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        title={t('a11y.channel_preferences')}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
            >
              <div
                className="absolute rounded-lg border border-border bg-card p-1 shadow-lg"
                style={{ top: pos.top, right: pos.right, minWidth: 176 }}
                onClick={(e) => e.stopPropagation()}
              >
                {pref !== 'subscribed' ? (
                  <button
                    onClick={() => { handleSave('subscribed'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Bell className="h-3.5 w-3.5" /> {t('action.subscribe')}
                  </button>
                ) : (
                  <button
                    onClick={() => { handleSave('neutral'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <BellOff className="h-3.5 w-3.5" /> {t('action.unsubscribe')}
                  </button>
                )}
                {pref !== 'not_interested' ? (
                  <button
                    onClick={() => { handleSave('not_interested'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <EyeOff className="h-3.5 w-3.5" /> {t('action.not_interested')}
                  </button>
                ) : (
                  <button
                    onClick={() => { handleSave('neutral'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> {t('action.remove_not_interested')}
                  </button>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
