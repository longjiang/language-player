import { auth } from '@/auth';

/**
 * Next.js 16 proxy (renamed middleware). Two surfaces share this app:
 * - admin routes: require `isAdmin`
 * - `/affiliate/*`: require `isAffiliate`
 *
 * Server-side endpoints re-check the role independently; the proxy only
 * chooses the shell and prevents obvious cross-surface navigation.
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const user = req.auth?.user as
    | { isAdmin?: boolean; isAffiliate?: boolean }
    | undefined;
  const isAdmin = user?.isAdmin === true;
  const isAffiliate = user?.isAffiliate === true;
  const isAffiliatePath = pathname === '/affiliate' || pathname.startsWith('/affiliate/');

  if (!isLoggedIn && pathname !== '/login') {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }
  if (isLoggedIn && pathname === '/login') {
    return Response.redirect(
      new URL(isAdmin ? '/analytics' : '/affiliate', req.nextUrl.origin),
    );
  }
  if (isLoggedIn) {
    if (isAffiliatePath && !isAffiliate) {
      return Response.redirect(new URL(isAdmin ? '/analytics' : '/login', req.nextUrl.origin));
    }
    if (!isAffiliatePath && !isAdmin) {
      return Response.redirect(new URL('/affiliate', req.nextUrl.origin));
    }
  }
  return undefined;
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
