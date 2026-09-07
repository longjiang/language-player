'use client';

import { Copy, Volume2, BookOpen, Square } from 'lucide-react';
import { useT } from '@/hooks/use-t';

interface SelectionTooltipProps {
  /** Selected text — shown as an affordance on hover (title). */
  text: string;
  /** Viewport rect of the selection — the tooltip is anchored near it. */
  rect: { x: number; y: number; width: number; height: number };
  onCopy: () => void;
  onSpeak: () => void;
  onLookUp: () => void;
  /** True while the selection is being spoken (swap the icon). */
  isSpeaking?: boolean;
}

const TOOLTIP_HEIGHT = 40;
const TOOLTIP_WIDTH = 220;

/**
 * Custom selection tooltip shown when the user drag-selects (or Shift-arrow
 * selects) tokenized text. Instead of immediately opening the dictionary
 * popup, the learner gets three actions (Copy / Read aloud / Look up), and the
 * native selection stays active so the handles can still be dragged to re-tune
 * the selection. `onMouseDown` preventDefault keeps the browser from collapsing
 * the selection when the tooltip is clicked.
 */
export function SelectionTooltip({
  text,
  rect,
  onCopy,
  onSpeak,
  onLookUp,
  isSpeaking = false,
}: SelectionTooltipProps) {
  const t = useT();

  const left = Math.max(12, Math.min(rect.x + rect.width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - 12));
  // Prefer below the selection; if that would clip the bottom, flip above.
  const preferredTop = rect.y + rect.height + 8;
  const belowFits = preferredTop + TOOLTIP_HEIGHT < window.innerHeight - 12;
  const top = belowFits ? preferredTop : Math.max(12, rect.y - TOOLTIP_HEIGHT - 8);

  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-lg"
      style={{ top, left, width: TOOLTIP_WIDTH }}
      role="toolbar"
      aria-label={t('action.look_up')}
    >
      <button
        type="button"
        onClick={onCopy}
        title={t('action.copy')}
        aria-label={t('action.copy')}
        className="flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Copy className="h-4 w-4" />
        <span>{t('action.copy')}</span>
      </button>
      <button
        type="button"
        onClick={onSpeak}
        title={t('action.read_aloud')}
        aria-label={t('action.read_aloud')}
        className="flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {isSpeaking ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        <span>{t('action.read_aloud')}</span>
      </button>
      <button
        type="button"
        onClick={onLookUp}
        title={t('action.look_up')}
        aria-label={t('action.look_up')}
        className="flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" />
        <span>{t('action.look_up')}</span>
      </button>
    </div>
  );
}
