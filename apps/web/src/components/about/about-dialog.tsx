'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AboutContent, type BuildInfo } from '@/components/about/about-content';
import pkg from '../../../package.json';

/**
 * Client-safe build metadata. Git info falls back to public env vars (inlined
 * at build time by Next.js); outside Vercel, commit/branch show "unknown".
 */
function getClientBuildInfo(): BuildInfo {
  return {
    version: (pkg as { version?: string }).version ?? '0.0.0',
    commitHash: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    branch: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? 'unknown',
    buildDate: new Date().toISOString(),
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  };
}

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const buildInfo = useMemo(getClientBuildInfo, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <AboutContent buildInfo={buildInfo} className="min-h-0 py-4" />
      </DialogContent>
    </Dialog>
  );
}
