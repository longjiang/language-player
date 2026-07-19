import { Loader2 } from 'lucide-react';

/**
 * Shown immediately during client-side navigation to the watch page
 * while the page chunk loads and the component mounts.
 */
export default function WatchLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
