import { NextResponse } from 'next/server';
import type { YouTubeVideo } from '@langplayer/shared';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? 'https://directusvps.zerotohero.ca/zerotohero';

/** Map L2 code to Directus youtube_videos table suffix. */
const TABLE_SUFFIX: Record<string, string> = {
  eu: '_2', vi: '_2',
  ko: '_3',
  zh: '_4',
  en: '_5',
  de: '_6',
  ja: '_7',
  fr: '_8',
  es: '_9', ca: '_9', ru: '_9',
  tr: '_10', pl: '_10', nl: '_10',
  he: '_11', pt: '_11', el: '_11', uk: '_11', cs: '_11', ar: '_11', sk: '_11', ms: '_11',
  it: '_12',
  id: '_13', sv: '_13', no: '_13', nan: '_13',
  th: '_14', my: '_14',
};

function getTableSuffix(l2: string): string {
  return TABLE_SUFFIX[l2] ?? '';
}

const FIELDS = 'youtube_id,id,title,duration,views,likes,comments,locale,date,category,tags,channel_id';

/**
 * GET /api/channels/[channelId]?l2=zh&page=1&page_size=24
 *
 * Returns channel info and a paginated list of videos for a YouTube channel.
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
    const suffix = getTableSuffix(l2);
    const table = `youtube_videos${suffix}`;
    const offset = (page - 1) * pageSize;

    // Fetch channel info from YouTube API via Python backend
    const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:5001';
    let channelInfo: { title: string; thumbnail: string } | null = null;
    try {
      const ciRes = await fetch(`${PYTHON_API_URL}/channel-info?channel_id=${channelId}`);
      if (ciRes.ok) {
        channelInfo = await ciRes.json();
      }
    } catch { /* channel info is optional */ }

    // Fetch videos for this channel from Directus
    const params = new URLSearchParams();
    params.set('filter[channel_id][eq]', channelId);
    params.set('fields', FIELDS);
    params.set('sort', '-date');
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    const url = `${DIRECTUS_URL}/items/${table}?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Directus error (${table}): ${res.status}`);
      return NextResponse.json({ channel: channelInfo, videos: [], hasMore: false }, { status: 200 });
    }

    const data = await res.json();
    const videos: YouTubeVideo[] = (data?.data ?? []).map((item: any) => ({
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
      channel: channelInfo,
      videos,
      page,
      hasMore: videos.length >= pageSize,
    });
  } catch (error) {
    console.error('Channel API error:', error);
    return NextResponse.json({ error: 'Failed to fetch channel videos' }, { status: 500 });
  }
}
