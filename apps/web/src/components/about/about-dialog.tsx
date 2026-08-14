'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { AboutContent, type BuildInfo } from '@/components/about/about-content';
import { PRODUCT_VERSION } from '@langplayer/shared';

/**
 * Client-safe build metadata.
 */
function getClientBuildInfo(): BuildInfo {
  return {
    version: PRODUCT_VERSION,
    buildDate: new Date().toISOString(),
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  };
}

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const buildInfo = useMemo(getClientBuildInfo, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">{t('title.about')}</DialogTitle>
        <AboutContent buildInfo={buildInfo} className="min-h-0 py-4" />
      </DialogContent>
    </Dialog>
  );
}
