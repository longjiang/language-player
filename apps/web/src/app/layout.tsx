import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/providers/session-provider';
import { ApiClientProvider } from '@/components/api-client-provider';
import { SavedWordsProvider } from '@/providers/saved-words-provider';
import { Toaster } from '@/components/ui/sonner';
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
const OG_IMAGE = '/og'; // dynamic OG image route

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Learn languages through video`,
  },
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
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Learn languages through video`,
      },
    ],
  },
  // Twitter / X Cards
  twitter: {
    card: 'summary_large_image',
    site: '@langplayer', // update if you have a Twitter handle
    title: `${SITE_NAME} — Learn languages through video`,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

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
            <Toaster richColors closeButton />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
