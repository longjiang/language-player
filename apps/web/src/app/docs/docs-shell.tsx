'use client';

import { LanguageProvider } from '@/providers/language-provider';
import { VideoPlayerProvider } from '@/providers/video-player-provider';
import { SettingsProvider } from '@/providers/settings-provider';
import { ExploreCacheProvider } from '@/providers/explore-cache-provider';
import { Header } from '@/components/layout/header';

/** Client wrapper that provides language context for the full app header on non-language pages. */
export function DocsShell({ children, l1, l2 }: { children: React.ReactNode; l1: string; l2: string }) {
  return (
    <LanguageProvider l1={l1} l2={l2}>
      <SettingsProvider>
        <ExploreCacheProvider>
          <VideoPlayerProvider>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
            </div>
          </VideoPlayerProvider>
        </ExploreCacheProvider>
      </SettingsProvider>
    </LanguageProvider>
  );
}
