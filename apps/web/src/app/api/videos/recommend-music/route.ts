import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRecommendedMusicEntertainment } from '@/lib/video-service';

/** Proxy API route: /api/videos/recommend-music?l2=ja&page=1 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const l2 = searchParams.get('l2') ?? 'en';
  const level = searchParams.get('level');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') ?? '24', 10);

  const session = await auth();
  const userId = session?.user?.id;

  const result = await getRecommendedMusicEntertainment(
    l2,
    level ? parseInt(level, 10) : undefined,
    page,
    pageSize,
    userId,
  );

  return NextResponse.json(result);
}
