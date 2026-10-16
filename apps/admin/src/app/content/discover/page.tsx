'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { Field } from '@/components/content/field';
import { L2Select } from '@/components/content/l2-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { useT } from '@/hooks/use-t';
import {
  discover,
  importBatch,
  languageMismatches,
  preflightVideos,
  type BatchImportOptions,
} from '@/lib/content-api';
import { ConfirmDialog } from '@/components/content/confirm-dialog';
import { LanguageCheckNotice, useMismatchDescription } from '@/components/content/language-check';
import { log, logerr } from '@/lib/logger';
import type {
  DiscoverResponse,
  ImportSummary,
  ImportVideoResult,
  PreflightResponse,
} from '@/types/content';
import { AlertCircle, Compass, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

const EMPTY_SUMMARY: ImportSummary = { total: 0, added: 0, updated: 0, skipped: 0, failed: 0 };
const DISCOVERY_TALK = 'Discover Content';

export default function DiscoverPage() {
  const t = useT();
  const authReady = useAuthReady();

  // Deliberately unset: a defaulted language is how candidates get
  // imported into the wrong one (SPEC-099).
  const [l2, setL2] = useState<string | null>(null);
  const [terms, setTerms] = useState('');
  const [termLimit, setTermLimit] = useState<number | ''>('');
  const [pages, setPages] = useState(1);
  const [maxPerChannel, setMaxPerChannel] = useState(1);
  const [talk, setTalk] = useState(DISCOVERY_TALK);
  const [force, setForce] = useState(false);
  const [cleanGenerated, setCleanGenerated] = useState(false);
  const [refreshExisting, setRefreshExisting] = useState(true);
  const [topN, setTopN] = useState<number | ''>('');

  const [report, setReport] = useState<DiscoverResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportVideoResult[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary>(EMPTY_SUMMARY);
  const [error, setError] = useState('');
  const stopRef = useRef(false);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  // The top-results path re-runs the search, so the caveat about checked ids
  // differing from imported ids only applies once it has been used.
  const [topNUsed, setTopNUsed] = useState(false);
  const [preflightError, setPreflightError] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState<{ description: string; run: () => void } | null>(null);
  const mismatchDescription = useMismatchDescription();

  function importOptions(): Omit<BatchImportOptions, 'youtube_ids' | 'l2'> {
    return {
      force,
      clean_generated: cleanGenerated,
      refresh_existing: refreshExisting,
      talk: talk.trim() || DISCOVERY_TALK,
      limit: 50,
    };
  }

  async function runSearch() {
    if (!l2) {
      toast.error(t('msg.language_required'));
      return;
    }
    setSearching(true);
    setError('');
    setResults([]);
    setImportSummary(EMPTY_SUMMARY);
    try {
      const response = await discover({
        l2,
        terms: terms.trim() || undefined,
        term_limit: termLimit === '' ? undefined : Number(termLimit),
        pages,
        max_per_channel: maxPerChannel,
      });
      setReport(response);
      setSelected(new Set(response.candidates.map((c) => c.youtube_id)));
      setTopN(response.candidates.length || '');
      setPreflight(null);
      setPreflightError('');
      // Candidates come from a Google scrape, so check their declared language
      // before anything can be imported.
      if (response.candidates.length > 0) {
        void checkLanguages(response.candidates.map((c) => c.youtube_id));
      }
    } catch (err) {
      logerr('discover failed', err);
      setReport(null);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSearching(false);
    }
  }

  async function checkLanguages(ids: string[]): Promise<PreflightResponse | null> {
    if (!l2 || ids.length === 0) return null;
    setChecking(true);
    setPreflightError('');
    try {
      const response = await preflightVideos(l2, ids);
      setPreflight(response);
      return response;
    } catch (err) {
      logerr('language preflight failed', err);
      setPreflightError(err instanceof Error ? err.message : t('error.general'));
      return null;
    } finally {
      setChecking(false);
    }
  }

  /** Ask before importing candidates that declare another language. */
  async function startImportSelected() {
    if (!l2 || selected.size === 0) return;
    const ids = [...selected];
    const response = await checkLanguages(ids);
    if (response && languageMismatches(response).length > 0) {
      setConfirm({ description: mismatchDescription(response), run: () => void importSelected() });
      return;
    }
    await importSelected();
  }

  /** Import exactly the reviewed candidates, through the batch importer. */
  async function importSelected() {
    if (!l2 || selected.size === 0) return;
    setImporting(true);
    setError('');
    stopRef.current = false;
    const ids = [...selected];
    setImportSummary(EMPTY_SUMMARY);
    setResults([]);
    const options = importOptions();
    let offset = 0;
    let accumulated = { ...EMPTY_SUMMARY };
    try {
      while (offset < ids.length && !stopRef.current) {
        const slice = ids.slice(offset, offset + 50);
        log('discover import page', { offset, size: slice.length });
        const response = await importBatch({ ...options, l2, youtube_ids: slice });
        setResults((prev) => [...prev, ...(response.results ?? [])]);
        accumulated = {
          total: accumulated.total + (response.summary?.total ?? 0),
          added: accumulated.added + (response.summary?.added ?? 0),
          updated: accumulated.updated + (response.summary?.updated ?? 0),
          skipped: accumulated.skipped + (response.summary?.skipped ?? 0),
          failed: accumulated.failed + (response.summary?.failed ?? 0),
        };
        setImportSummary(accumulated);
        offset += 50;
      }
      toast.success(t('msg.import_finished'));
    } catch (err) {
      logerr('discover import failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setImporting(false);
    }
  }

  /** Let the backend re-run the search and import its best N candidates. */
  async function importTopN() {
    if (!l2) return;
    setTopNUsed(true);
    setImporting(true);
    setError('');
    try {
      const response = await discover({
        l2,
        terms: terms.trim() || undefined,
        term_limit: termLimit === '' ? undefined : Number(termLimit),
        pages,
        max_per_channel: maxPerChannel,
        import: true,
        limit: topN === '' ? undefined : Number(topN),
        talk: talk.trim() || DISCOVERY_TALK,
        force,
        clean_generated: cleanGenerated,
        refresh_existing: refreshExisting,
      });
      setReport(response);
      if (response.import) {
        setResults(response.import.results ?? []);
        setImportSummary(response.import.summary ?? EMPTY_SUMMARY);
      }
      toast.success(t('msg.import_finished'));
    } catch (err) {
      logerr('discover import top-n failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setImporting(false);
    }
  }
  const allSelected = !!report && report.candidates.length > 0 && selected.size === report.candidates.length;
  const busy = searching || importing || !authReady;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.discover')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('msg.discover_hint')}</p>
        </div>
      </div>

      <Card className="mt-5">
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label={t('label.language')}
              hint={!l2 ? t('msg.choose_language_first') : undefined}
            >
              <L2Select value={l2} onChange={setL2} className="w-full" />
            </Field>
            <Field label={t('label.term_limit')} hint={t('msg.term_limit_hint')}>
              <Input
                type="number"
                min={1}
                value={termLimit}
                onChange={(e) => setTermLimit(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>
            <Field label={t('label.pages')}>
              <Input
                type="number"
                min={1}
                max={5}
                value={pages}
                onChange={(e) => setPages(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
              />
            </Field>
            <Field label={t('label.max_per_channel')}>
              <Input
                type="number"
                min={1}
                value={maxPerChannel}
                onChange={(e) => setMaxPerChannel(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label={t('label.search_terms')} hint={t('msg.discover_terms_hint')}>
              <Textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />
              {t('label.force')}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={cleanGenerated}
                onChange={(e) => setCleanGenerated(e.target.checked)}
              />
              {t('label.clean_generated')}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={refreshExisting}
                onChange={(e) => setRefreshExisting(e.target.checked)}
              />
              {t('label.refresh_existing')}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Button disabled={busy || !l2} onClick={() => void runSearch()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
              {t('action.find_candidates')}
            </Button>
            <div className="w-40">
              <Field label={t('label.talk')}>
                <Input value={talk} onChange={(e) => setTalk(e.target.value)} />
              </Field>
            </div>
            <div className="w-32">
              <Field label={t('label.limit')}>
                <Input
                  type="number"
                  min={1}
                  value={topN}
                  onChange={(e) => setTopN(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </Field>
            </div>
            <Button
              variant="secondary"
              disabled={busy || !l2 || !report || report.candidates.length === 0}
              onClick={() => void startImportSelected()}
            >
              <Upload className="h-4 w-4" />
              {t('action.import_selected', { count: selected.size })}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !l2 || !report || report.candidates.length === 0}
              onClick={() => void importTopN()}
            >
              {t('action.import_top_n')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('msg.discover_import_note')}</p>
        </CardContent>
      </Card>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {searching && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('msg.loading')}
        </div>
      )}

      {!searching && report && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">
              {t('label.scraped')}: {report.scraped}
            </Badge>
            <Badge variant="outline">
              {t('label.candidates')}: {report.candidates.length}
            </Badge>
            {Object.entries(report.skipped ?? {}).map(([reason, ids]) => (
              <Badge key={reason} variant="secondary" title={ids.join(', ')}>
                {reason}: {ids.length}
              </Badge>
            ))}
          </div>

          {report.candidates.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {t('msg.no_candidates')}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">
                      <Checkbox
                        checked={allSelected}
                        aria-label={t('action.select_all')}
                        onChange={() =>
                          setSelected(
                            allSelected
                              ? new Set()
                              : new Set(report.candidates.map((c) => c.youtube_id)),
                          )
                        }
                      />
                    </th>
                    <th className="px-3 py-2">{t('label.title')}</th>
                    <th className="px-3 py-2">{t('label.youtube_id')}</th>
                    <th className="px-3 py-2">{t('label.views')}</th>
                    <th className="px-3 py-2">{t('label.search_terms')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.candidates.map((candidate) => (
                    <tr key={candidate.youtube_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(candidate.youtube_id)}
                          aria-label={candidate.title}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(candidate.youtube_id)) next.delete(candidate.youtube_id);
                              else next.add(candidate.youtube_id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="max-w-[24rem] px-3 py-2">
                        <a
                          className="hover:underline"
                          href={`https://www.youtube.com/watch?v=${candidate.youtube_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {candidate.title}
                        </a>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{candidate.youtube_id}</td>
                      <td className="px-3 py-2">{candidate.views ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{candidate.term}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <LanguageCheckNotice
          response={preflight}
          checking={checking}
          error={preflightError}
          extraNote={topNUsed ? t('msg.language_check_top_n_caveat') : undefined}
        />
      </div>

      {(results.length > 0 || importSummary.total > 0) && (
        <Card className="mt-5">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{t('label.summary')}</span>
              <Badge variant="secondary">
                {t('label.added')}: {importSummary.added}
              </Badge>
              <Badge variant="secondary">
                {t('label.updated')}: {importSummary.updated}
              </Badge>
              <Badge variant="secondary">
                {t('label.skipped')}: {importSummary.skipped}
              </Badge>
              <Badge variant={importSummary.failed ? 'destructive' : 'secondary'}>
                {t('label.failed')}: {importSummary.failed}
              </Badge>
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {results.length > 0 && (
              <div className="mt-4 max-h-[24rem] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">{t('label.youtube_id')}</th>
                      <th className="px-3 py-2">{t('label.status')}</th>
                      <th className="px-3 py-2">{t('label.reason')}</th>
                      <th className="px-3 py-2">{t('label.title')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={`${result.youtube_id}-${index}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{result.youtube_id}</td>
                        <td className="px-3 py-2">{result.status}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {result.reason ?? result.error ?? '—'}
                        </td>
                        <td className="max-w-[20rem] truncate px-3 py-2">{result.title ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('msg.language_mismatch_title')}
        description={confirm?.description ?? ''}
        confirmLabel={t('action.import_anyway')}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          void run?.();
        }}
      />
    </AdminShell>
  );
}
