import { NextResponse } from 'next/server';

const PYTHON_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pythonvps.zerotohero.ca';

/** GET /api/videos/[videoId] — get a single video by YouTube ID */
export async function GET(
  _request: Request,
  { params }: { params: { videoId: string } },
) {
  try {
    const res = await fetch(`${PYTHON_URL}/video/${params.videoId}`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    const data = await res.json();
    const video = data?.data ?? data;
    return NextResponse.json(video);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}
