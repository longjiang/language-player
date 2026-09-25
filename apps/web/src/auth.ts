import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logerr } from '@/lib/logger';

class EmailNotConfirmedError extends CredentialsSignin {
  code = 'email_not_confirmed';
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

/** Credentials arrive as form fields; `undefined` is serialized as the literal
 * string "undefined", so normalize that (and "null"/blank) back to absent. */
function cleanCredential(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== 'undefined' && trimmed !== 'null' ? trimmed : undefined;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
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
            const errorData = await res.json().catch(() => null);
            const backendCode = errorData?.errors?.[0]?.code;
            // Log the real status/code so a failed login is diagnosable without
            // guessing whether the password or the backend was at fault.
            log('auth backend rejected login', { status: res.status, code: backendCode });
            if (backendCode === 'email_not_confirmed') {
              throw new EmailNotConfirmedError();
            }
            // 5xx = Flask or GoTrue failed (e.g. Supabase unreachable), not bad
            // credentials. 4xx = the credentials really were rejected (Flask
            // passes GoTrue's status through: 400 invalid, 429 rate limited).
            if (res.status >= 500) throw new AuthBackendError();
            return null;
          }
          const data = await res.json();
          const token = data?.token;
          if (!token) return null;

          const user = data?.user;
          if (!user) return null;

          return {
            id: String(user.id),
            email: String(user.email),
            name: String(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email),
            accessToken: token,
            refreshToken: data?.refreshToken ?? null,
            tokenExpiresAt: tokenExpiry(token),
          };
        } catch (error) {
          // Rethrow the NextAuth error codes. The previous bare `catch { return
          // null; }` swallowed `throw new EmailNotConfirmedError()` above, so
          // the login page's email_not_confirmed redirect could never fire.
          if (error instanceof EmailNotConfirmedError || error instanceof AuthBackendError) {
            throw error;
          }
          logerr('auth backend unreachable', error); // non-info-level: caught network exception — stack trace needed
          throw new AuthBackendError();
        }
      },
    }),
    Credentials({
      id: 'link-token',
      name: 'Email confirmation link',
      credentials: {
        token: { label: 'Token', type: 'text' },
        tokenHash: { label: 'Token Hash', type: 'text' },
        type: { label: 'Type', type: 'text' },
        email: { label: 'Email', type: 'email' },
        accessToken: { label: 'Access Token', type: 'text' },
        refreshToken: { label: 'Refresh Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials) return null;

        const accessToken = cleanCredential(credentials.accessToken);
        const refreshToken = cleanCredential(credentials.refreshToken);
        const token = cleanCredential(credentials.token);
        const tokenHash = cleanCredential(credentials.tokenHash);
        const email = cleanCredential(credentials.email);
        const type = cleanCredential(credentials.type);

        let data: any = null;
        if (accessToken || refreshToken) {
          const res = await fetch(`${PYTHON_API_URL}/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(accessToken ? { accessToken } : {}),
              ...(refreshToken ? { refreshToken } : {}),
            }),
          });
          if (!res.ok) return null;
          data = await res.json();
        } else {
          if (!token && !tokenHash) return null;
          const res = await fetch(`${PYTHON_API_URL}/auth/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              token_hash: tokenHash,
              email,
              type,
            }),
          });
          if (!res.ok) return null;
          data = await res.json();
        }

        const sessionToken = data?.token;
        const user = data?.user;
        if (!sessionToken || !user) return null;

        return {
          id: String(user.id),
          email: String(user.email),
          name: String(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email),
          accessToken: sessionToken,
          refreshToken: data?.refreshToken ?? null,
          tokenExpiresAt: tokenExpiry(sessionToken),
        };
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' as const },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Client-pushed refresh: ApiClientProvider calls update() after
      // POST /auth/refresh, which lands here with trigger === 'update'.
      // Persist the rotated pair so useSession consumers see it immediately.
      if (trigger === 'update' && session && typeof (session as any)?.accessToken === 'string') {
        const s = session as any;
        if (s.accessToken) token.accessToken = s.accessToken;
        if (typeof s.refreshToken === 'string') token.refreshToken = s.refreshToken;
        if (typeof s.tokenExpiresAt === 'number') token.tokenExpiresAt = s.tokenExpiresAt;
      }
      // Persist the Supabase access token from authorize() into the JWT
      if (user && 'accessToken' in user) {
        const u = user as any;
        token.accessToken = u.accessToken as string;
        token.refreshToken = u.refreshToken as string | null;
        token.tokenExpiresAt = u.tokenExpiresAt as number;
      }
      // Explicitly persist name + email — NextAuth v5 beta may not auto-populate
      if (user) {
        token.name = user.name ?? undefined;
        token.email = user.email ?? undefined;
        token.picture = (user as any).image ?? undefined;
      }

      // Refresh the Supabase access token before it expires (ADR-0023).
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
      // NextAuth v5 auto-populates token.sub from user.id on first sign-in
      return token;
    },
    async session({ session, token }) {
      // Expose the Supabase access token and user id to the client via session
      if (session.user) {
        (session.user as any).accessToken = (token.accessToken as string) ?? null;
        (session.user as any).refreshToken = (token.refreshToken as string) ?? null;
        // token.sub is the user ID (auto-populated by NextAuth from user.id)
        (session.user as any).id = token.sub ?? null;
      }
      return session;
    },
  },
});
