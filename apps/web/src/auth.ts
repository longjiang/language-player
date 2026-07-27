import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:5001';

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
          if (!token) return null;

          const user = data?.user;
          if (!user) return null;

          return {
            id: String(user.id),
            email: String(user.email),
            name: String(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email),
            directusToken: token,  // retained for API calls to Flask → Directus
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' as const },
  callbacks: {
    async jwt({ token, user, account }) {
      // Persist the Directus token from authorize() into the JWT
      if (user && 'directusToken' in user) {
        token.directusToken = (user as any).directusToken as string;
      }
      // Explicitly persist name + email — NextAuth v5 beta may not auto-populate
      if (user) {
        token.name = user.name ?? undefined;
        token.email = user.email ?? undefined;
        token.picture = (user as any).image ?? undefined;
      }
      // NextAuth v5 auto-populates token.sub from user.id on first sign-in
      return token;
    },
    async session({ session, token }) {
      // Expose the Directus token and user id to the client via session
      if (session.user) {
        (session.user as any).directusToken = (token.directusToken as string) ?? null;
        // token.sub is the user ID (auto-populated by NextAuth from user.id)
        (session.user as any).id = token.sub ?? null;
      }
      return session;
    },
  },
});
