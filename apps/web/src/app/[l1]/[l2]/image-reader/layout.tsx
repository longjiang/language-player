import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Image Reader',
  description: 'Read text from images with interactive word lookup and translations.',
  openGraph: {
    images: [{ url: '/og?emoji=%F0%9F%93%B8&title=Image+Reader', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og?emoji=%F0%9F%93%B8&title=Image+Reader'],
  },
};

export default function ImageReaderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
