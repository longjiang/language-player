import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: { word: string };
}): Promise<Metadata> {
  const word = decodeURIComponent(params.word ?? '');
  const title = word ? `${word} — Dictionary` : 'Dictionary';

  return {
    title,
    description: word
      ? `Look up "${word}" — definitions, examples, frequency levels, and more on Language Player.`
      : 'Look up words with definitions and examples.',
    openGraph: {
      images: [{ url: `/og?emoji=%F0%9F%93%96&title=${encodeURIComponent(title)}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`/og?emoji=%F0%9F%93%96&title=${encodeURIComponent(title)}`],
    },
  };
}

export default function WordDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
