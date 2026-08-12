import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/api-url';

/** GET /api/channels?l2=ja — channel list for a language (SPEC-072). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const l2 = searchParams.get('l2') ?? 'en';

  try {
    const res = await fetch(
      `${PYTHON_API_URL}/channels?l2=${encodeURIComponent(l2)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to load channels' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ channels: Array.isArray(data) ? data : [] });
  } catch {
    return NextResponse.json({ error: 'Failed to load channels' }, { status: 500 });
  }
}
