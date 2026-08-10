import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { SessionProvider } from '@/providers/session-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Language Player — Admin',
  description: 'Admin console for Language Player',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            {children}
            <Toaster richColors closeButton={false} position="top-center" />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
