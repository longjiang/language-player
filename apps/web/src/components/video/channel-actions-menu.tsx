'use client';

import { useEffect, useState } from 'react';
import { MoreVertical, Bell, BellOff, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChannelPreference, type ChannelPref } from '@/hooks/use-channel-preference';

interface ChannelActionsMenuProps {
  channelId: string;
}

/** Reusable "..." menu for channel subscribe/not-interested actions. */
export function ChannelActionsMenu({ channelId }: ChannelActionsMenuProps) {
  const { pref, savePref } = useChannelPreference(channelId);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        title="Channel preferences"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg">
            {pref !== 'subscribed' ? (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); savePref('subscribed'); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Bell className="h-3.5 w-3.5" />
                Subscribe
              </button>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); savePref('neutral'); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <BellOff className="h-3.5 w-3.5" />
                Unsubscribe
              </button>
            )}

            {pref !== 'not_interested' ? (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); savePref('not_interested'); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Not Interested
              </button>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); savePref('neutral'); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Remove &quot;Not Interested&quot;
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
