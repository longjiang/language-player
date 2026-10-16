'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { ConfirmDialog } from '@/components/content/confirm-dialog';
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
import { sweepUnavailable } from '@/lib/content-api';
import { parseVideoIds } from '@/lib/video-ids';
import { log, logerr } from '@/lib/logger';
import type { SweepRow } from '@/types/content';
import { AlertCircle, Loader2, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SweepPage() {
  const t = useT();
  const authReady = useAuthReady();

  const [l2, setL2] = useState<string | null>('en');
  const [idsText, setIdsText] = useState('');
  const [limit, setLimit] = useState(50);
  const [checked, setChecked] = useState(0);
  const [rows, setRows] = useState<SweepRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<{ after_id: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pages, setPages] = useState(0);

  async function runCheck(reset: boolean) {
    if (!l2) {
      toast.error(t('msg.language_required'));
      return;
    }
    setRunning(true);
    setError('');
    if (reset) {
      setRows([]);
      setChecked(0);
      setPages(0);
    }
    try {
      const explicitIds = parseVideoIds(idsText);
      const response = await sweepUnavailable({
        l2,
        youtube_ids: explicitIds.length ? explicitIds : undefined,
        cursor: reset ? null : cursor,
        limit,
        delete: false,
      });
      setRows((prev) => {
        const merged = reset ? response.unavailable : [...prev, ...response.unavailable];
        const seen = new Set<string>();
        const deduped = merged.filter((row) => {
          if (seen.has(row.youtube_id)) return false;
          seen.add(row.youtube_id);
          return true;
        });
        setSelected(new Set(deduped.map((row) => row.youtube_id)));
        return deduped;
      });
      setChecked((prev) => (reset ? response.checked : prev + response.checked));
      setCursor(response.next_cursor);
      setPages((prev) => (reset ? 1 : prev + 1));
    } catch (err) {
      logerr('sweep failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRunning(false);
    }
  }

  async function runDelete(onlySelected: boolean) {
    if (!l2) return;
    const ids = onlySelected
      ? rows.filter((row) => selected.has(row.youtube_id)).map((row) => row.youtube_id)
      : rows.map((row) => row.youtube_id);
    if (ids.length === 0) return;
    setRunning(true);
    setError('');
    log('sweep delete', { count: ids.length, onlySelected });
    try {
      const response = await sweepUnavailable({ l2, youtube_ids: ids, delete: true, limit });
      toast.success(t('msg.sweep_deleted', { count: response.deleted.length }));
      const deleted = new Set(response.deleted.map((row) => row.youtube_id));
      setRows((prev) => prev.filter((row) => !deleted.has(row.youtube_id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of deleted) next.delete(id);
        return next;
      });
    } catch (err) {
      logerr('sweep delete failed', err);
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRunning(false);
      setConfirmDelete(false);
    }
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <AdminShell>
      <div>
        <h1 className="text-2xl font-bold">{t('title.unavailable_videos')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('msg.sweep_hint')}</p>
      </div>

      <Card className="mt-5">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Field label={t('label.language')}>
                <L2Select value={l2} onChange={setL2} className="w-full" />
              </Field>
            </div>
            <div className="w-32">
              <Field label={t('label.limit')}>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 50)}
                />
              </Field>
            </div>
            <Button disabled={running || !authReady} onClick={() => void runCheck(true)}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {t('action.check')}
            </Button>
            {cursor && (
              <Button variant="outline" disabled={running} onClick={() => void runCheck(false)}>
                {t('action.continue')}
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={running || selected.size === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t('action.delete_selected', { count: selected.size })}
            </Button>
          </div>

          <Field label={t('label.youtube_ids')} hint={t('msg.sweep_ids_hint')}>
            <Textarea
              rows={3}
              value={idsText}
              onChange={(e) => setIdsText(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>

          <p className="text-xs text-muted-foreground">{t('msg.sweep_report_hint')}</p>
        </CardContent>
      </Card>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {pages > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t('label.checked')}: {checked}
          </Badge>
          <Badge variant={rows.length ? 'destructive' : 'success'}>
            {t('label.unavailable')}: {rows.length}
          </Badge>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    aria-label={t('action.select_all')}
                    onChange={() =>
                      setSelected(
                        allSelected ? new Set() : new Set(rows.map((row) => row.youtube_id)),
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2">{t('label.youtube_id')}</th>
                <th className="px-3 py-2">{t('label.id')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.youtube_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(row.youtube_id)}
                      aria-label={row.youtube_id}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.youtube_id)) next.delete(row.youtube_id);
                          else next.add(row.youtube_id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <a
                      className="font-mono text-xs text-primary hover:underline"
                      href={`https://www.youtube.com/watch?v=${row.youtube_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.youtube_id}
                    </a>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 0 && rows.length === 0 && !error && (
        <Card className="mt-5">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('msg.no_results')}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('action.delete_selected', { count: selected.size })}
        description={t('msg.sweep_delete_warning')}
        busy={running}
        onConfirm={() => void runDelete(true)}
      />
    </AdminShell>
  );
}
