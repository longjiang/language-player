import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tokenizer',
  description: 'Test and debug language tokenization.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%94%A4&title=Tokenizer', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%94%A4&title=Tokenizer'],
  },
};

export default function TokenizerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
