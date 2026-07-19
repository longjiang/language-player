'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong — Language Player</title>
        <style>{`
          *,::before,::after{box-sizing:border-box;margin:0;padding:0}
          body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0B0D18;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh}
          .card{background:#1a1d2e;border-radius:0.75rem;padding:2rem;max-width:28rem;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
          .icon{margin-bottom:1rem}
          h1{font-size:1.25rem;font-weight:600;margin-bottom:0.5rem}
          p{color:#9ca3af;font-size:0.875rem;margin-bottom:1.5rem}
          button{cursor:pointer;background:#5c7cfa;color:#fff;border:none;padding:0.5rem 1.25rem;border-radius:0.5rem;font-size:0.875rem;font-weight:500;display:inline-flex;align-items:center;gap:0.5rem}
          button:hover{background:#4c6ef5}
          code{display:block;margin-top:1.5rem;font-size:0.75rem;color:#6b7280;word-break:break-all}
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. This is usually fixed by restarting the development server.</p>
          <button onClick={reset}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Try again
          </button>
          {error.digest && <code>Error ID: {error.digest}</code>}
        </div>
      </body>
    </html>
  );
}
