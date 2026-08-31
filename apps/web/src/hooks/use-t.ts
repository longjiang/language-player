'use client';

import { useMemo } from 'react';
import { useMessages, useTranslations } from 'next-intl';

/**
 * Resolve a dot-path key against a nested messages object.
 * e.g., resolveNested(messages, 'action.cancel') → messages.action.cancel
 */
function resolveNested(
  messages: Record<string, unknown>,
  id: string,
): string | undefined {
  let current: unknown = messages;
  for (const part of id.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? (current as string) : undefined;
}

/**
 * Type-safe translation hook. Keys autocomplete from messages/en.json.
 *
 * Mirrors the mobile `useT` contract: when called WITHOUT `values`, it returns
 * the RAW message text (with `{placeholder}` intact) so the shared LLM prompt
 * builders in `@langplayer/utils` (`buildWordExplainPrompt` /
 * `buildExplainBlockPrompt`) can substitute their own params. next-intl's
 * built-in `t()` would otherwise throw a FORMATTING_ERROR on unbound
 * placeholders (the "The intl string context variable l2Name was not provided"
 * crash that produced empty "Let DeepSeek Explain" bubbles). When `values` IS
 * passed, this delegates back to next-intl for full ICU formatting.
 */
export function useT() {
  const messages = useMessages();
  const t = useTranslations();

  return useMemo(() => {
    // Cast the wrapper to `typeof t` so the existing call sites keep their
    // exact translator type (with `.rich` / `.markup`); next-intl resolves the
    // key at runtime. Values are delegated verbatim to the underlying `t`.
    const translation = ((id: string, values?: unknown, formats?: unknown) => {
      if (values === undefined) {
        const raw = resolveNested(messages as Record<string, unknown>, id);
        if (raw !== undefined) return raw;
      }
      return t(id as any, values as any, formats as any);
    }) as unknown as typeof t;

    // Mirror next-intl's translator helpers (t.raw, t.rich, t.has, t.markup, …)
    // onto the wrapper so callers that use them — SettingsListPanel's t.raw(),
    // review's t.rich() — keep working. These are own enumerable props on `t`.
    Object.assign(translation, t);

    return translation;
  }, [messages, t]);
}
