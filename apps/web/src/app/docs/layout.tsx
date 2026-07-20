import Link from 'next/link';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          {/* Logo */}
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

          {/* Docs nav */}
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
