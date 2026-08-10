import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PYTHON_API_URL } from '@/lib/api-url';

class AdminOnlyError extends CredentialsSignin {
  code = 'admin_only';
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
          if (!res.ok) return null;
          const data = await res.json();
          const token = data?.token;
          const user = data?.user;
          if (!token || !user) return null;

          // Only administrators may use the admin console.
          if (!user.isAdmin) throw new AdminOnlyError();

          return {
            id: String(user.id),
            email: String(user.email),
            name: String(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email),
            isAdmin: true,
            accessToken: token,
            refreshToken: data?.refreshToken ?? null,
            tokenExpiresAt: tokenExpiry(token),
          };
        } catch (error) {
          if (error instanceof AdminOnlyError) throw error;
          return null;
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
      }
      return session;
    },
  },
});
