import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/providers/session-provider';
import { ApiClientProvider } from '@/components/api-client-provider';
import { SavedWordsProvider } from '@/providers/saved-words-provider';
import { Toaster } from '@/components/ui/sonner';
import { PYTHON_API_URL } from '@/lib/api-url';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const SITE_NAME = 'Language Player';
const SITE_DESCRIPTION =
  'Watch videos with interactive dual subtitles, built-in dictionary, and smart difficulty tracking. Learn 60+ languages naturally.';
const SITE_URL =
  process.env.AUTH_URL || 'https://language-player.netlify.app';
const OG_IMAGE = '/og'; // fallback: logo-only OG image

/** Fetch 4 popular English-learning videos for the homepage OG thumbnail (no user context). */
async function getRecommendedIdsForOg(): Promise<string[]> {
  try {
    const res = await fetch(`${PYTHON_API_URL}/recommend-videos?l2=en&limit=4`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const videos: { youtube_id?: string }[] = Array.isArray(data) ? data : data?.data ?? [];
    return videos.slice(0, 4).map(v => v.youtube_id).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const videoIds = await getRecommendedIdsForOg();

  let ogImageUrl = OG_IMAGE; // fallback: logo + wordmark
  if (videoIds.length > 0) {
    ogImageUrl = `/og?videos=${videoIds.join(',')}&lang=English`;
  }

  const defaultTitle = `${SITE_NAME} — Learn languages through video`;

  return {
    metadataBase: new URL(SITE_URL),
    title: defaultTitle,
    description: SITE_DESCRIPTION,
    keywords: ['language learning', 'subtitles', 'dictionary', 'video', 'immersion'],
    // Open Graph (Facebook, LinkedIn, Discord, etc.)
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: SITE_URL,
      title: `${SITE_NAME} — Learn languages through video`,
      description: SITE_DESCRIPTION,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — Learn languages through video`,
        },
      ],
    },
    // Twitter / X Cards
    twitter: {
      card: 'summary_large_image',
      site: '@langplayer',
      title: `${SITE_NAME} — Learn languages through video`,
      description: SITE_DESCRIPTION,
      images: [ogImageUrl],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <SessionProvider>
              <ApiClientProvider>
                <SavedWordsProvider>
                  {children}
                </SavedWordsProvider>
              </ApiClientProvider>
            </SessionProvider>
            <Toaster richColors closeButton position="top-center" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
