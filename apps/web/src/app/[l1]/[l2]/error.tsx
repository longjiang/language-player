'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();

  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-amber-500" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        An unexpected error occurred loading this page.
        {error.message && (
          <span className="mt-1 block text-xs text-muted-foreground/70">
            {error.message}
          </span>
        )}
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" size="sm" onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => router.push('/language-select')}
        >
          Change language
        </Button>
      </div>
    </div>
  );
}
