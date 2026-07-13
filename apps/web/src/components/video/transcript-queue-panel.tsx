'use client';

import { useState } from 'react';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { FileText, ListVideo } from 'lucide-react';

interface TranscriptQueuePanelProps {
  transcript: React.ReactNode;
  queue: React.ReactNode;
  className?: string;
  defaultTab?: 'transcript' | 'queue';
}

export function TranscriptQueuePanel({
  transcript,
  queue,
  className,
  defaultTab = 'transcript',
}: TranscriptQueuePanelProps) {
  const [tab, setTab] = useState<'transcript' | 'queue'>(defaultTab);
  const t = useT();

  return (
    <div className={cn('flex flex-col rounded-xl border border-border bg-card', className)}>
      {/* Tab header */}
      <div className="flex shrink-0 border-b border-border">
        <button
          onClick={() => setTab('transcript')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
            tab === 'transcript'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FileText className="h-4 w-4" />
          {t('title.transcript')}
        </button>
        <button
          onClick={() => setTab('queue')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
            tab === 'queue'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ListVideo className="h-4 w-4" />
          {t('title.queue')}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'transcript' ? transcript : queue}
      </div>
    </div>
  );
}
