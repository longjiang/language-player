import { NextResponse } from 'next/server';
import type { SyncedLine } from '@/lib/subtitle-csv';
import { PYTHON_API_URL } from '@/lib/api-url';

/** GET /api/videos/[videoId]/subtitles?l2=ja */
export async function GET(
  request: Request,
  { params }: { params: { videoId: string } },
) {
  const { searchParams } = new URL(request.url);
  const l2 = searchParams.get('l2') ?? 'en';

  try {
    // Fetch subtitles via Flask backend (which proxies Directus + falls back to YouTube)
    const flaskRes = await fetch(
      `${PYTHON_API_URL}/videos/subtitles?youtube_id=${params.videoId}&l2=${l2}`,
      { next: { revalidate: 3600 } },
    );

    if (!flaskRes.ok) {
      console.error('Flask subtitle fetch failed:', flaskRes.status);
      return NextResponse.json({ lines: [] });
    }

    const data = await flaskRes.json();
    const lines: SyncedLine[] = (data?.lines ?? []).map((l: any) => ({
      starttime: l.starttime ?? 0,
      duration: l.duration ?? 0,
      l1Line: '',
      l2Line: l.l2Line ?? l.line ?? '',
    }));

    return NextResponse.json({ lines });
  } catch (err) {
    console.error('Subtitle fetch error:', err);
    return NextResponse.json({ lines: [] });
  }
}
