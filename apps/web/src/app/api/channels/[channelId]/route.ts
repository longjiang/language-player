import { NextResponse } from 'next/server';
import type { YouTubeVideo } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * GET /api/channels/[channelId]?l2=zh&page=1&page_size=24
 *
 * Returns channel info and a paginated list of videos for a YouTube channel.
 * Data is fetched from the Flask backend (which proxies Directus).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const { searchParams } = new URL(request.url);
  const l2 = searchParams.get('l2') ?? 'en';
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') ?? '24', 10);

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
  }

  try {
    // Fetch channel info + videos via Flask backend
    const flaskRes = await fetch(
      `${PYTHON_API_URL}/channels/${channelId}/videos?l2=${l2}&page=${page}&page_size=${pageSize}`,
      { next: { revalidate: 3600 } },
    );

    if (!flaskRes.ok) {
      console.error(`Flask channel error (${channelId}): ${flaskRes.status}`);
      return NextResponse.json({ channel: null, videos: [], hasMore: false }, { status: 200 });
    }

    const data = await flaskRes.json();
    const videos: YouTubeVideo[] = (data?.videos ?? []).map((item: any) => ({
      youtube_id: item.youtube_id,
      id: item.id,
      title: item.title,
      duration: item.duration,
      views: item.views,
      likes: item.likes,
      comments: item.comments,
      locale: item.locale,
      date: item.date,
      category: item.category,
      tags: item.tags,
      channel_id: item.channel_id,
    }));

    return NextResponse.json({
      channel: data.channel,
      videos,
      page: data.page,
      hasMore: data.hasMore,
    });
  } catch (error) {
    console.error('Channel API error:', error);
    return NextResponse.json({ error: 'Failed to fetch channel videos' }, { status: 500 });
  }
}
