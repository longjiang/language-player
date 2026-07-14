'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Top-level error page redirected to by the Python backend after a failed
 * Stripe / PayPal payment.  Not under /[l1]/[l2] because the Python backend
 * uses a fixed URL: {host}/go-pro-error
 */
export default function GoProErrorPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <AlertTriangle className="mx-auto h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-2xl font-bold">Payment Issue</h1>
      <p className="mt-2 text-muted-foreground">
        There was a problem with your payment. Don&apos;t worry — you haven&apos;t been charged.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Please try again, or contact us for assistance.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/language-select">
          <Button variant="outline">Try Again</Button>
        </Link>
        <a href="mailto:jon.long@zerotohero.ca">
          <Button>
            Email Support
          </Button>
        </a>
      </div>
    </div>
  );
}
