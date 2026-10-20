import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logerr } from '@/lib/logger';

class NotAuthorizedError extends CredentialsSignin {
  code = 'not_authorized';
}

/**
 * The auth backend (Flask → Supabase GoTrue) could not be reached, or returned
 * a server error. This is NOT a credential problem, so it must never surface as
 * "invalid email or password" — that sends people hunting for a password bug
 * when the real cause is a network/proxy/backend outage.
 */
class AuthBackendError extends CredentialsSignin {
  code = 'auth_unreachable';
}

function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1]!;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64url').toString('utf-8'));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Auth.js cookie namespace for the admin app.
 *
 * Browsers scope cookies by host, **not by port**. Locally, `apps/web`
 * (localhost:3000) and `apps/admin` (localhost:3100) therefore share one
 * cookie jar, and Auth.js names its session cookie `authjs.session-token` in
 * both apps by default. The second app to sign in overwrites the first app's
 * cookie, and because each app has its own `AUTH_SECRET` the leftover JWT
 * cannot be decrypted by the other — so signing into admin silently logs web
 * out, and vice versa.
 *
 * Keep web on the Auth.js default (existing web sessions stay valid) and give
 * admin its own `lp-admin.*` names. In production the apps live on separate
 * hosts, where cookies are already isolated; this makes local dev match that.
 *
 * The `__Secure-`/`__Host-` prefixes mirror Auth.js's own HTTPS defaults. They
 * are derived from `AUTH_URL` because a prefix that disagrees with the actual
 * scheme makes the browser drop the cookie.
 */
const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
const secureCookies = authUrl.startsWith('https://');
const securePrefix = secureCookies ? '__Secure-' : '';
const hostPrefix = secureCookies ? '__Host-' : '';

const adminCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: secureCookies,
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  cookies: {
    sessionToken: {
      name: `${securePrefix}lp-admin.session-token`,
      options: adminCookieOptions,
    },
    callbackUrl: {
      name: `${securePrefix}lp-admin.callback-url`,
      options: adminCookieOptions,
    },
    csrfToken: {
      name: `${hostPrefix}lp-admin.csrf-token`,
      options: adminCookieOptions,
    },
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${PYTHON_API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });

          if (!res.ok) {
            const body = await res.text();
            // Log the real status/body so a failed login is diagnosable without
            // guessing whether the password or the backend was at fault.
            log('auth backend rejected login', { status: res.status, body: body.slice(0, 300) });
            // 5xx = Flask or GoTrue failed (e.g. Supabase unreachable), not bad
            // credentials. 4xx = the credentials really were rejected.
            if (res.status >= 500) throw new AuthBackendError();
            return null;
          }

          const data = await res.json();
          const token = data?.token;
          const user = data?.user;
          if (!token || !user) {
            log('auth response missing token/user', { keys: Object.keys(data ?? {}) });
            return null;
          }

          // Admins use the admin surface; active affiliates use /affiliate.
          // Everyone else is refused at the source.
          if (!user.isAdmin && !user.isAffiliate) throw new NotAuthorizedError();

          return {
            id: String(user.id),
            email: String(user.email),
            name: String(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email),
            isAdmin: user.isAdmin === true,
            isAffiliate: user.isAffiliate === true,
            affiliateCode: user.affiliate?.code ?? null,
            accessToken: token,
            refreshToken: data?.refreshToken ?? null,
            tokenExpiresAt: tokenExpiry(token),
          };
        } catch (error) {
          if (error instanceof NotAuthorizedError || error instanceof AuthBackendError) throw error;
          logerr('auth backend unreachable', error); // non-info-level: caught network exception — stack trace needed
          throw new AuthBackendError();
        }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' as const },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update' && session && typeof (session as any)?.accessToken === 'string') {
        const s = session as any;
        if (s.accessToken) token.accessToken = s.accessToken;
        if (typeof s.refreshToken === 'string') token.refreshToken = s.refreshToken;
        if (typeof s.tokenExpiresAt === 'number') token.tokenExpiresAt = s.tokenExpiresAt;
      }
      if (user && 'accessToken' in user) {
        const u = user as any;
        token.accessToken = u.accessToken as string;
        token.refreshToken = u.refreshToken as string | null;
        token.tokenExpiresAt = u.tokenExpiresAt as number;
        token.isAdmin = u.isAdmin === true;
        token.isAffiliate = u.isAffiliate === true;
        token.affiliateCode = u.affiliateCode ?? null;
      }
      if (user) {
        token.name = user.name ?? undefined;
        token.email = user.email ?? undefined;
      }

      // Refresh the Supabase access token shortly before it expires.
      const accessToken = token.accessToken as string | undefined;
      const refreshToken = token.refreshToken as string | undefined;
      const expiresAt = (token.tokenExpiresAt as number | undefined) ?? 0;
      if (accessToken && refreshToken && expiresAt - Date.now() < 60_000) {
        try {
          const res = await fetch(`${PYTHON_API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (res.ok) {
            const data = await res.json();
            token.accessToken = data.token;
            token.refreshToken = data.refreshToken ?? refreshToken;
            token.tokenExpiresAt = tokenExpiry(data.token);
          }
        } catch {
          // Keep the old token; the next 401 will force a re-login.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).accessToken = (token.accessToken as string) ?? null;
        (session.user as any).refreshToken = (token.refreshToken as string) ?? null;
        (session.user as any).id = token.sub ?? null;
        (session.user as any).isAdmin = token.isAdmin === true;
        (session.user as any).isAffiliate = token.isAffiliate === true;
        (session.user as any).affiliateCode = token.affiliateCode ?? null;
      }
      return session;
    },
  },
});
