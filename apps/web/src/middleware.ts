import { NextResponse, type NextRequest } from 'next/server';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/language-select'];
const AUTH_PATHS = ['/login', '/register', '/forgot-password'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static assets, auth API, public API routes, and OG image
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/videos') ||
    pathname.startsWith('/api/channels') ||
    pathname.startsWith('/og') ||
    pathname.startsWith('/favicon') ||
    /\.(ico|png|jpg|jpeg|svg|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check auth via session cookie (NextAuth sets this)
  const sessionCookie = req.cookies.get('authjs.session-token') ?? req.cookies.get('__Secure-authjs.session-token');
  const isAuthenticated = !!sessionCookie?.value;

  const segments = pathname.split('/').filter(Boolean);
  const l1 = segments[0];
  const l2 = segments[1];

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  // 1. Redirect unauthenticated users to login
  if (!isAuthenticated && !isPublic && pathname !== '/') {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    // If URL contains valid L1, set locale cookie so login page renders in the right language
    if (l1 && SUPPORTED_L1S.includes(l1 as any)) {
      response.cookies.set('NEXT_LOCALE', l1, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    }
    return response;
  }

  // 2. Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthPage) {
    const l1Cookie = req.cookies.get('l1');
    const l2Cookie = req.cookies.get('l2');
    if (l1Cookie?.value && l2Cookie?.value) {
      return NextResponse.redirect(new URL(`/${l1Cookie.value}/${l2Cookie.value}`, req.url));
    }
    return NextResponse.redirect(new URL('/language-select', req.url));
  }

  // 3. On public pages, set NEXT_LOCALE from existing l1 cookie if available
  if (isPublic) {
    const l1Cookie = req.cookies.get('l1');
    if (l1Cookie?.value && SUPPORTED_L1S.includes(l1Cookie.value as any)) {
      const response = NextResponse.next();
      response.cookies.set('NEXT_LOCALE', l1Cookie.value, { path: '/', maxAge: 365 * 24 * 60 * 60 });
      return response;
    }
    return NextResponse.next();
  }

  // 4. Validate L1/L2 in URL
  if (l1 && l2) {
    if (!SUPPORTED_L1S.includes(l1 as any) || !SUPPORTED_L2S.includes(l2 as any)) {
      return NextResponse.rewrite(new URL('/_not-found', req.url));
    }
    const response = NextResponse.next();
    response.cookies.set('l1', l1, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    response.cookies.set('l2', l2, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    response.cookies.set('NEXT_LOCALE', l1, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    return response;
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
