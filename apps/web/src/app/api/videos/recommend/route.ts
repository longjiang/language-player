import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRecommendedVideos } from '@/lib/video-service';

/** Proxy API route: /api/videos/recommend?l2=zh&level=3&page=1&exclude_ids=1,2,3&category_mode=mixed&made_for_kids=1 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const l2 = searchParams.get('l2') ?? 'en';
  const level = searchParams.get('level');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') ?? '24', 10);
  const excludeIds = searchParams.get('exclude_ids')?.split(',').filter(Boolean) ?? undefined;
  const categoryMode = searchParams.get('category_mode') as 'mixed' | 'discovery' | 'music' | null;
  const madeForKidsParam = searchParams.get('made_for_kids');

  // Get user ID from session so Python backend can filter watch history + channel prefs
  const session = await auth();
  const userId = session?.user?.id;

  const result = await getRecommendedVideos(
    l2,
    level ? parseInt(level, 10) : undefined,
    page,
    pageSize,
    userId,
    excludeIds,
    categoryMode ?? undefined,
    madeForKidsParam !== null ? madeForKidsParam === '1' : undefined,
  );

  return NextResponse.json(result);
}
