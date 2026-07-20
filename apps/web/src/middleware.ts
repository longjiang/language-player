import { NextResponse, type NextRequest } from 'next/server';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';

const AUTH_PATHS = ['/login', '/register', '/forgot-password'];
const GUEST_NAV_LIMIT = 3;
const AUTH_REQUIRED_SEGMENTS = ['saved-words', 'review', 'settings', 'go-pro', 'watch-history', 'tokenizer'];

/** Pages that don't count toward the guest navigation limit (content consumption). */
const GUEST_NAV_FREE_SEGMENTS = ['watch', 'explore', 'search', 'dictionary', 'music', 'live-tv', 'tv-shows', 'reader', 'web-reader', 'epub', 'channel', 'docs'];

/** Parse Accept-Language header and return the best matching supported L1 code, or null. */
function detectLocale(request: NextRequest): string | null {
  const header = request.headers.get('accept-language');
  if (!header) return null;
  // Parse "zh-CN,zh;q=0.9,en;q=0.8" → [{ code: 'zh-CN', q: 1 }, { code: 'zh', q: 0.9 }, ...]
  const locales = header.split(',').map(part => {
    const trimmed = part.trim();
    const [rawCode = '', qVal] = trimmed.split(';q=');
    return { code: (rawCode ?? '').trim(), q: qVal ? parseFloat(qVal) : 1 };
  }).filter(l => l.code.length > 0).sort((a, b) => b.q - a.q);

  for (const { code } of locales) {
    // Try exact match first (e.g., zh-Hans)
    if (SUPPORTED_L1S.includes(code as any)) return code;
    // Try primary language (e.g., zh from zh-CN)
    const primary = code.split('-')[0]!;
    if (SUPPORTED_L1S.includes(primary as any)) return primary;
  }
  return null;
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static assets, auth API, public API routes, OG image, and about
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/videos') ||
    pathname.startsWith('/api/channels') ||
    pathname.startsWith('/og') ||
    pathname.startsWith('/about') ||
    pathname.startsWith('/favicon') ||
    /\.(ico|png|jpg|jpeg|svg|css|js)$/.test(pathname)
  ) {
    // Set NEXT_LOCALE so i18n works on these pages
    const l1Cookie = req.cookies.get('l1');
    const response = NextResponse.next();
    if (l1Cookie?.value && SUPPORTED_L1S.includes(l1Cookie.value as any)) {
      response.cookies.set('NEXT_LOCALE', l1Cookie.value, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    } else {
      const detected = detectLocale(req);
      if (detected) {
        response.cookies.set('NEXT_LOCALE', detected, { path: '/', maxAge: 365 * 24 * 60 * 60 });
      }
    }
    return response;
  }

  // Check auth via session cookie (NextAuth sets this)
  const sessionCookie = req.cookies.get('authjs.session-token') ?? req.cookies.get('__Secure-authjs.session-token');
  const isAuthenticated = !!sessionCookie?.value;

  const segments = pathname.split('/').filter(Boolean);
  const l1 = segments[0];
  const l2 = segments[1];

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const isPublic = isAuthPage || pathname === '/language-select';

  // 1. Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthPage) {
    const l1Cookie = req.cookies.get('l1');
    const l2Cookie = req.cookies.get('l2');
    if (l1Cookie?.value && l2Cookie?.value) {
      return NextResponse.redirect(new URL(`/${l1Cookie.value}/${l2Cookie.value}`, req.url));
    }
    return NextResponse.redirect(new URL('/language-select', req.url));
  }

  // 2. On public/auth pages, set NEXT_LOCALE from existing l1 cookie, or detect from browser
  if (isPublic || pathname === '/') {
    const l1Cookie = req.cookies.get('l1');
    const response = NextResponse.next();
    if (l1Cookie?.value && SUPPORTED_L1S.includes(l1Cookie.value as any)) {
      response.cookies.set('NEXT_LOCALE', l1Cookie.value, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    } else {
      // No L1 cookie yet — detect from browser Accept-Language
      const detected = detectLocale(req);
      if (detected) {
        response.cookies.set('NEXT_LOCALE', detected, { path: '/', maxAge: 365 * 24 * 60 * 60 });
      }
    }
    return response;
  }

  // 3. App pages under /[l1]/[l2] — allow guest access with nav limit
  if (l1 && l2 && SUPPORTED_L1S.includes(l1 as any) && SUPPORTED_L2S.includes(l2 as any)) {
    const response = NextResponse.next();
    response.cookies.set('l1', l1, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    response.cookies.set('l2', l2, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    response.cookies.set('NEXT_LOCALE', l1, { path: '/', maxAge: 365 * 24 * 60 * 60 });

    if (isAuthenticated) {
      response.cookies.set('guest-nav-count', '', { path: '/', maxAge: 0 });
      return response;
    }

    // Guest: gate auth-required features immediately
    if (segments.length >= 3 && AUTH_REQUIRED_SEGMENTS.includes(segments[2]!)) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Guest nav tracking: after N page views, soft-gate to login
    // Content consumption pages (watch, explore, search, etc.) don't count
    const isNavFree = segments.length >= 3 && GUEST_NAV_FREE_SEGMENTS.includes(segments[2]!);
    const navCount = isNavFree
      ? parseInt(req.cookies.get('guest-nav-count')?.value || '0', 10)
      : parseInt(req.cookies.get('guest-nav-count')?.value || '0', 10) + 1;

    if (!isNavFree) {
      response.cookies.set('guest-nav-count', String(navCount), {
        path: '/', maxAge: 60 * 60 * 24, httpOnly: false,
      });
    }

    if (navCount > GUEST_NAV_LIMIT) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      const redirect = NextResponse.redirect(loginUrl);
      redirect.cookies.set('guest-nav-count', String(navCount), { path: '/', maxAge: 60 * 60 * 24, httpOnly: false });
      return redirect;
    }

    return response;
  }

  // 4. Invalid L1/L2
  if (l1 && l2) {
    if (!SUPPORTED_L1S.includes(l1 as any) || !SUPPORTED_L2S.includes(l2 as any)) {
      return NextResponse.rewrite(new URL('/_not-found', req.url));
    }
  }

  // 5. Redirect root for authenticated users
  if (pathname === '/' && isAuthenticated) {
    const l1Cookie = req.cookies.get('l1');
    const l2Cookie = req.cookies.get('l2');
    if (l1Cookie?.value && l2Cookie?.value) {
      return NextResponse.redirect(new URL(`/${l1Cookie.value}/${l2Cookie.value}`, req.url));
    }
    return NextResponse.redirect(new URL('/language-select', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
