import type { Metadata } from 'next';

/**
 * Metadata is deliberately minimal — no blocking API calls.
 *
 * generateMetadata blocks the ENTIRE RSC response (including the parent
 * layout's <Header>), so any outbound I/O here causes a visible freeze
 * with a blank white page. The full title and OG image are set client-side
 * via useEffect in the explore page component after data arrives.
 *
 * Social crawlers get a generic title — that's fine for this content page.
 */
export const metadata: Metadata = {
  title: 'Explore',
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
