import { NextResponse } from 'next/server';

const PYTHON_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pythonvps.zerotohero.ca';

/** GET /api/videos/[videoId]?l2=ja — get video metadata by YouTube ID */
export async function GET(
  request: Request,
  { params }: { params: { videoId: string } },
) {
  try {
    const { searchParams } = new URL(request.url);
    const l2 = searchParams.get('l2') ?? 'en';

    // Fetch from recommend endpoint and find this specific video
    const res = await fetch(
      `${PYTHON_URL}/recommend-videos?l2=${l2}&limit=50`,
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const videos = await res.json();
    const video = Array.isArray(videos)
      ? videos.find((v: any) => v.youtube_id === params.videoId) ?? null
      : null;

    if (!video) {
      return NextResponse.json({
        youtube_id: params.videoId,
        title: 'YouTube Video',
      });
    }

    return NextResponse.json(video);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}
