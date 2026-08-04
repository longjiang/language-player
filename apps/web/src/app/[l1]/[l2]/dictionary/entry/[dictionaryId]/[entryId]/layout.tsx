import type { Metadata } from 'next';

/**
 * Static metadata only — no API calls.
 *
 * generateMetadata blocks the entire RSC response (including loading.tsx),
 * so any outbound I/O here causes a visible freeze on every navigation.
 * The entry page fetches its own data client-side with proper loading states.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Dictionary Entry',
    description: 'View word definitions, examples, and conjugations on Language Player.',
  };
}

export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
