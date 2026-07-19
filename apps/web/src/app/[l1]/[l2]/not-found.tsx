import Link from 'next/link';

export default function LanguageNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground/30">404</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This page doesn&apos;t exist in the current language pair.
      </p>
      <Link
        href="/language-select"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Change language
      </Link>
    </div>
  );
}
