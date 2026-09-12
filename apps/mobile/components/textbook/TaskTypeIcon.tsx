import React from 'react';
import { BookOpen, Headphones, MessagesSquare, PenLine } from 'lucide-react-native';
import type { TaskType } from '@langplayer/textbooks';
import { taskTypeKey } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

/**
 * A task's type as an icon.
 *
 * The mobile counterpart of the web component, and for the same reason: printing
 * the type's own name (`listening`) inside a Chinese list was stray English. The
 * name stays as the accessible label, localized, so a screen reader announces the
 * type instead of losing it.
 */
const TASK_TYPE_ICONS: Record<
  TaskType,
  React.ComponentType<{ size?: number; color?: string; accessibilityLabel?: string }>
> = {
  listening: Headphones,
  reading: BookOpen,
  conversation: MessagesSquare,
  writing: PenLine,
};

export function TaskTypeIcon({ type, size = 14 }: { type?: TaskType; size?: number }) {
  const t = useT();
  if (!type) return null;
  const Icon = TASK_TYPE_ICONS[type];
  if (!Icon) return null;
  return <Icon size={size} color={ICON_MUTED} accessibilityLabel={t(taskTypeKey(type) as never)} />;
}
