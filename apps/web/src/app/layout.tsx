import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/providers/session-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Language Player — Learn languages through video',
    template: '%s | Language Player',
  },
  description:
    'Watch videos with interactive dual subtitles, built-in dictionary, and smart difficulty tracking. Learn 60+ languages naturally.',
  keywords: ['language learning', 'subtitles', 'dictionary', 'video', 'immersion'],
  openGraph: {
    type: 'website',
    siteName: 'Language Player',
    title: 'Language Player — Learn languages through video',
    description:
      'Watch videos with interactive dual subtitles, built-in dictionary, and smart difficulty tracking.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <SessionProvider>
            {children}
          </SessionProvider>
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
