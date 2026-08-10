import { auth } from '@/auth';

/**
 * Next.js 16 proxy (renamed middleware). Guards every route: unauthenticated
 * visitors are sent to /login, authenticated admins are bounced away from it.
 * Authorization is enforced again server-side by every Flask admin endpoint
 * (Supabase JWT `app_metadata.is_admin` claim).
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && pathname !== '/login') {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }
  if (isLoggedIn && pathname === '/login') {
    return Response.redirect(new URL('/', req.nextUrl.origin));
  }
  return undefined;
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
