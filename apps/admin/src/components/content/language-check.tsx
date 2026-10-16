'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/hooks/use-t';
import type { PreflightResponse } from '@/types/content';
import { AlertTriangle, CircleCheck } from 'lucide-react';

/**
 * The pre-import language warning (SPEC-099).
 *
 * `declared_locale` is YouTube's `defaultAudioLanguage`, and YouTube omits it
 * on many uploads, so a clean check is never a guarantee — the copy says so
 * rather than implying the content was verified.
 */
export function LanguageCheckNotice({
  response,
  checking,
  error,
  extraNote,
}: {
  response: PreflightResponse | null;
  checking?: boolean;
  error?: string;
  extraNote?: string;
}) {
  const t = useT();
  if (!response && !checking && !error) return null;

  const mismatches = (response?.results ?? []).filter(
    (row) => row.block_reason === 'locale_mismatch',
  );
  const blocked = (response?.results ?? []).filter(
    (row) => row.block_reason && row.block_reason !== 'locale_mismatch',
  );
  const clean = !!response && mismatches.length === 0 && blocked.length === 0 && !error;

  return (
    <Card
      className={
        mismatches.length > 0 || error
          ? 'border-destructive/50'
          : clean
            ? 'border-emerald-500/40'
            : 'border-amber-500/40'
      }
    >
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {mismatches.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CircleCheck className="h-4 w-4 text-emerald-600" />
          )}
          <span className="text-sm font-medium">{t('title.language_check')}</span>
          {response && (
            <>
              <Badge variant="secondary">
                {t('label.checked')}: {response.results.length}
              </Badge>
              <Badge variant={mismatches.length ? 'destructive' : 'secondary'}>
                {t('label.declared_language_mismatches')}: {mismatches.length}
              </Badge>
              {blocked.length > 0 && (
                <Badge variant="warning">
                  {t('label.other_blocks')}: {blocked.length}
                </Badge>
              )}
              {response.l2_locales.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {response.l2}: {response.l2_locales.join(', ')}
                </span>
              )}
            </>
          )}
          {checking && <span className="text-xs text-muted-foreground">{t('msg.loading')}</span>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {mismatches.length > 0 && (
          <>
            <p className="text-sm text-destructive">
              {t('msg.language_mismatch_body', {
                count: mismatches.length,
                total: response?.results.length ?? mismatches.length,
                l2: response?.l2 ?? '',
              })}
            </p>
            <ul className="max-h-48 space-y-1 overflow-auto text-xs">
              {mismatches.map((row) => (
                <li key={row.youtube_id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{row.youtube_id}</span>
                  <Badge variant="destructive">{row.declared_locale ?? '?'}</Badge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {row.title ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {blocked.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {blocked.map((row) => (
              <li key={row.youtube_id}>
                <span className="font-mono">{row.youtube_id}</span> — {row.block_reason}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          {t('msg.language_check_hint')}
          {extraNote ? ` ${extraNote}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

/** The confirm-dialog body for importing despite a mismatch. */
export function useMismatchDescription() {
  const t = useT();
  return (response: PreflightResponse | null) => {
    const mismatches = (response?.results ?? []).filter(
      (row) => row.block_reason === 'locale_mismatch',
    );
    const sample = mismatches
      .slice(0, 5)
      .map((row) => `${row.youtube_id} (${row.declared_locale ?? '?'})`)
      .join(', ');
    return t('msg.language_mismatch_confirm', {
      count: mismatches.length,
      l2: response?.l2 ?? '',
      sample,
    });
  };
}
