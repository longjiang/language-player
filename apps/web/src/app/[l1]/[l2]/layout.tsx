import { notFound } from 'next/navigation';
import { LanguageProvider } from '@/providers/language-provider';
import { VideoPlayerProvider } from '@/providers/video-player-provider';
import { SettingsProvider } from '@/providers/settings-provider';
import { ThemeSync } from '@/components/theme-sync';
import { ExploreCacheProvider } from '@/providers/explore-cache-provider';
import { UserLibraryProvider } from '@/providers/user-library-provider';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { Header } from '@/components/layout/header';
import { ReaderChromeProvider } from '@/providers/reader-chrome-provider';

export default async function LanguageLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ l1: string; l2: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  // Validate language codes server-side
  if (
    !SUPPORTED_L1S.includes(params.l1 as any) ||
    !SUPPORTED_L2S.includes(params.l2 as any)
  ) {
    notFound();
  }

  return (
    <LanguageProvider l1={params.l1} l2={params.l2}>
      <UserLibraryProvider>
        <SettingsProvider>
          <ThemeSync />
          <ExploreCacheProvider>
            <VideoPlayerProvider>
              <ReaderChromeProvider>
                <div className="flex min-h-screen flex-col">
                  <Header />
                  <main className="flex-1">{children}</main>
                </div>
              </ReaderChromeProvider>
            </VideoPlayerProvider>
          </ExploreCacheProvider>
        </SettingsProvider>
      </UserLibraryProvider>
    </LanguageProvider>
  );
}
