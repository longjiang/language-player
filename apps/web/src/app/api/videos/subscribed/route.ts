import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/api-url';

/** GET /api/videos/subscribed?l2=ja&channelIds=a,b,c — newest videos from subscribed channels (SPEC-072). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const l2 = searchParams.get('l2') ?? 'en';
  const channelIds = searchParams.get('channelIds') ?? '';
  const limit = searchParams.get('limit') ?? '100';

  if (!channelIds) {
    return NextResponse.json({ videos: [] });
  }

  try {
    const res = await fetch(
      `${PYTHON_API_URL}/search-videos?l2=${encodeURIComponent(l2)}` +
        `&channelIds=${encodeURIComponent(channelIds)}&limit=${limit}&sort=-date`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to load subscribed videos' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ videos: Array.isArray(data) ? data : [] });
  } catch {
    return NextResponse.json({ error: 'Failed to load subscribed videos' }, { status: 500 });
  }
}
