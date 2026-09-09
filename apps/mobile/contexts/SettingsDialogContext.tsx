import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { type SettingsCategory } from '@/components/settings/settings-categories';
import { log } from '@/lib/logger';

/**
 * App-wide host for the settings modal (ADR-0042). Mounted once in the root
 * layout so any entry point (Me tab, user menu, sync-status badge) can open
 * Settings in place — no navigation, no page swap.
 */
interface SettingsDialogContextValue {
  /** Open the modal, optionally on a specific category. */
  openSettings: (category?: SettingsCategory | null) => void;
  closeSettings: () => void;
}

const SettingsDialogContext = createContext<SettingsDialogContextValue | null>(null);

export function useSettingsDialog(): SettingsDialogContextValue {
  const ctx = useContext(SettingsDialogContext);
  if (!ctx) {
    throw new Error('useSettingsDialog must be used inside <SettingsDialogProvider>');
  }
  return ctx;
}

export function SettingsDialogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Read through a ref so `openSettings` stays identity-stable: deep-link route
  // screens call it from an effect, and a changing identity would re-open the
  // modal after the user closes it (the pathname changes as we navigate away).
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SettingsCategory | null>(null);

  const openSettings = useCallback((next: SettingsCategory | null = null) => {
    log(`[LP Mobile] openSettings category=${next ?? 'list'} from=${pathnameRef.current}`);
    setCategory(next);
    setOpen(true);
  }, []);

  const closeSettings = useCallback(() => setOpen(false), []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) return;
    // A settings route exists only as a deep-link target (ADR-0042): when the
    // modal closes, leave it so the URL matches what is on screen. When the
    // modal was opened in place there is no settings route and nothing to do.
    if (pathname.includes('/settings')) {
      log('[LP Mobile] settings dialog closed — leaving settings route');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/(me)' as never);
    }
  }, [pathname, router]);

  const value = useMemo(
    () => ({ openSettings, closeSettings }),
    [openSettings, closeSettings],
  );

  return (
    <SettingsDialogContext.Provider value={value}>
      {children}
      <SettingsDialog open={open} onOpenChange={handleOpenChange} initialCategory={category} />
    </SettingsDialogContext.Provider>
  );
}
