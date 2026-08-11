import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { SessionProvider } from '@/providers/session-provider';
import { Toaster } from '@/components/ui/sonner';
import { ActionLoggerProvider } from '@/components/action-logger-provider';
import { SessionTokenMirror } from '@/components/session-token-mirror';
import './globals.css';

export const metadata: Metadata = {
  title: 'Language Player — Admin',
  description: 'Admin console for Language Player',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <SessionTokenMirror />
            <ActionLoggerProvider>
              {children}
              <Toaster richColors closeButton={false} position="top-center" />
            </ActionLoggerProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
