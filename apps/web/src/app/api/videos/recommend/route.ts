import { NextResponse } from 'next/server';
import { getRecommendedVideos } from '@/lib/video-service';

/** Proxy API route: /api/videos/recommend?l2=zh&level=3&page=1 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const l2 = searchParams.get('l2') ?? 'en';
  const level = searchParams.get('level');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') ?? '24', 10);

  const result = await getRecommendedVideos(
    l2,
    level ? parseInt(level, 10) : undefined,
    page,
    pageSize,
  );

  return NextResponse.json(result);
}
