import { notFound } from 'next/navigation';
import { LanguageProvider } from '@/providers/language-provider';
import { VideoPlayerProvider } from '@/providers/video-player-provider';
import { SettingsProvider } from '@/providers/settings-provider';
import { ExploreCacheProvider } from '@/providers/explore-cache-provider';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { Header } from '@/components/layout/header';

export default function LanguageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { l1: string; l2: string };
}) {
  // Validate language codes server-side
  if (
    !SUPPORTED_L1S.includes(params.l1 as any) ||
    !SUPPORTED_L2S.includes(params.l2 as any)
  ) {
    notFound();
  }

  return (
    <LanguageProvider l1={params.l1} l2={params.l2}>
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
