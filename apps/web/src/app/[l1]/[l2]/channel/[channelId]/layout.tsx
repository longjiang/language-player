import type { Metadata } from 'next';

export async function generateMetadata(
  props: {
    params: Promise<{ channelId: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const channelId = params.channelId ?? '';
  const title = channelId ? `Channel: ${channelId}` : 'Channel';

  return {
    title,
    description: 'Browse videos from this YouTube channel with interactive dual subtitles.',
    openGraph: {
      images: [{ url: `/og?emoji=%F0%9F%93%A1&title=${encodeURIComponent(title)}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`/og?emoji=%F0%9F%93%A1&title=${encodeURIComponent(title)}`],
    },
  };
}

export default function ChannelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
