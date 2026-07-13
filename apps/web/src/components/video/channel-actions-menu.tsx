'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Bell, BellOff, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChannelPreference } from '@/hooks/use-channel-preference';

interface ChannelActionsMenuProps {
  channelId: string;
}

/** Reusable "..." menu for channel subscribe/not-interested actions.
 *  Uses a portal to avoid clipping from parent overflow:hidden containers. */
export function ChannelActionsMenu({ channelId }: ChannelActionsMenuProps) {
  const { pref, savePref } = useChannelPreference(channelId);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

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
        title="Channel preferences"
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
                    onClick={() => { savePref('subscribed'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Bell className="h-3.5 w-3.5" /> Subscribe
                  </button>
                ) : (
                  <button
                    onClick={() => { savePref('neutral'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <BellOff className="h-3.5 w-3.5" /> Unsubscribe
                  </button>
                )}
                {pref !== 'not_interested' ? (
                  <button
                    onClick={() => { savePref('not_interested'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <EyeOff className="h-3.5 w-3.5" /> Not Interested
                  </button>
                ) : (
                  <button
                    onClick={() => { savePref('neutral'); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> Remove &quot;Not Interested&quot;
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
