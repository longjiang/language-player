import { createHmac } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

const CODE_RE = /^[A-Z0-9]{3,40}$/;
const MAX_AGE = 60 * 24 * 60 * 60;

function sign(code: string, issued: number, secret: string) {
  return createHmac('sha256', secret).update(`v1.${code}.${issued}`).digest('hex');
}

/**
 * Set the signed affiliate cookie only after the browser has stored an
 * affirmative `lp_consent` choice. The route is same-origin and deliberately
 * does not accept an affiliate id — only the public code in the URL.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: 'Invalid affiliate code' }, { status: 400 });
  }

  const consentRaw = req.cookies.get('lp_consent')?.value;
  let consent: { affiliate?: boolean } | null = null;
  try {
    consent = consentRaw ? JSON.parse(decodeURIComponent(consentRaw)) : null;
  } catch {
    consent = null;
  }
  if (!consent?.affiliate) {
    return NextResponse.json({ error: 'Affiliate cookie consent required' }, { status: 403 });
  }

  const secret = process.env.AFFILIATE_COOKIE_SECRET ?? process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Affiliate cookie secret is not configured' }, { status: 500 });
  }
  const issued = Math.floor(Date.now() / 1000);
  const token = `v1.${code}.${issued}.${sign(code, issued, secret)}`;
  const res = NextResponse.json({ ok: true, expiresInDays: 60 });
  res.cookies.set('lp_aff', token, {
    maxAge: MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  });
  return res;
}

/** Withdraw consent / clear the affiliate cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('lp_aff', '', { maxAge: 0, path: '/' });
  return res;
}
