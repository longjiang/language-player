'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import type { SettingsCategory } from '@/components/settings/settings-categories';

/**
 * Deep-link target for a settings category (ADR-0042). The route renders the
 * settings modal instead of a page, so `/[l1]/[l2]/settings/display`, bookmarks
 * and the Classic redirect adapter keep working. Closing leaves the route —
 * same pattern as the About dialog (SPEC-073).
 */
export function SettingsRoute({ category = null }: { category?: SettingsCategory | null }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const { l1, l2 } = useLanguage();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      router.replace(`/${l1.code}/${l2.code}/explore`);
    }
  };

  return (
    <SettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      initialCategory={category}
    />
  );
}
