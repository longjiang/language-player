/**
 * Mobile hrefs for the textbook feature (SPEC-095).
 *
 * The shared `taskHref` builds `/{l1}/{l2}/tasks/...` for the web router. Mobile
 * routes are not language-prefixed — the language pair comes from context — and
 * expo-router needs the group segments, so the paths differ and must not be
 * shared.
 */

import { taskPathParts } from '@langplayer/textbooks';

const GROUP = '/(tabs)/(vocab)';

/** The TOC screen for a book. */
export function mobileBookHref(bookId: string): string {
  return `${GROUP}/tasks/${bookId}`;
}

/** The task screen for a canonical task id. */
export function mobileTaskHref(taskId: string): string {
  const parts = taskPathParts(taskId);
  if (!parts) return `${GROUP}/tasks`;
  return `${GROUP}/tasks/${parts.bookId}/${parts.unitId}/${parts.lessonId}/${parts.taskId}`;
}
