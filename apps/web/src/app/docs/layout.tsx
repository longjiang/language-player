import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { DocsShell } from './docs-shell';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const l1 = cookieStore.get('l1')?.value;
  const l2 = cookieStore.get('l2')?.value;

  // If user has valid language context, use the full app header
  if (l1 && l2 && SUPPORTED_L1S.includes(l1 as any) && SUPPORTED_L2S.includes(l2 as any)) {
    return <DocsShell l1={l1} l2={l2}>{children}</DocsShell>;
  }

  // Fallback: minimal header for first-time visitors
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/language-select" className="flex items-center gap-2 font-bold">
            <Image
              src="/img/logo.png"
              alt="Language Player"
              width={28}
              height={28}
              className="h-7 w-7 flex-shrink-0"
              priority
            />
            <span className="hidden sm:inline">Language Player</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/docs"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
              Docs
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
