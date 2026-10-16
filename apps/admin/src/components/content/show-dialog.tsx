'use client';

import { Field, FormSection } from '@/components/content/field';
import { L2Select } from '@/components/content/l2-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { createShow, updateShow } from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import type { AdminShow, ShowInput, ShowKind } from '@/types/content';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ShowForm {
  title: string;
  youtube_id: string;
  channel_id: string;
  year: string;
  tags: string;
  category: string;
  locale: string;
  lex_div: string;
  avg_views: string;
  status: string;
  hidden: boolean;
  audiobook: boolean;
  made_for_kids: boolean;
}

const EMPTY: ShowForm = {
  title: '',
  youtube_id: '',
  channel_id: '',
  year: '',
  tags: '',
  category: '',
  locale: '',
  lex_div: '',
  avg_views: '',
  status: '',
  hidden: false,
  audiobook: false,
  made_for_kids: false,
};

function formFrom(show: AdminShow | null): ShowForm {
  if (!show) return EMPTY;
  const s = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  return {
    title: s(show.title),
    youtube_id: s(show.youtube_id),
    channel_id: s(show.channel_id),
    year: s(show.year),
    tags: s(show.tags),
    category: s(show.category),
    locale: s(show.locale),
    lex_div: s(show.lex_div),
    avg_views: s(show.avg_views),
    status: s(show.status),
    hidden: !!show.hidden,
    audiobook: !!show.audiobook,
    made_for_kids: !!show.made_for_kids,
  };
}

function num(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function str(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

/** Create / edit a `tv_shows` or `talks` row (`_SHOW_WRITABLE_BY_TABLE`). */
export function ShowDialog({
  open,
  onOpenChange,
  kind,
  show,
  defaultL2,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ShowKind;
  show: AdminShow | null;
  defaultL2: string | null;
  onSaved: () => void;
}) {
  const t = useT();
  const isCreate = show === null;
  const isTalk = kind === 'talks';
  const noun = isTalk ? t('label.talk') : t('title.tv_show');
  const [form, setForm] = useState<ShowForm>(EMPTY);
  const [l2, setL2] = useState<string | null>(defaultL2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFrom(show));
    setL2(defaultL2);
  }, [open, show, defaultL2, kind]);

  function set<K extends keyof ShowForm>(key: K, value: ShowForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    if (saving) return;
    if (!form.title.trim()) {
      toast.error(t('msg.title_required'));
      return;
    }
    if (isCreate && !l2) {
      toast.error(t('msg.language_required'));
      return;
    }
    setSaving(true);
    const payload: ShowInput = {
      title: form.title.trim(),
      youtube_id: str(form.youtube_id),
      channel_id: str(form.channel_id),
      tags: str(form.tags),
      category: str(form.category),
      locale: str(form.locale),
      status: str(form.status),
      lex_div: num(form.lex_div),
      avg_views: num(form.avg_views),
      hidden: form.hidden ? 1 : 0,
      made_for_kids: form.made_for_kids ? 1 : 0,
      ...(isTalk ? { audiobook: form.audiobook ? 1 : 0 } : { year: num(form.year) }),
      ...(isCreate ? { l2: l2 ?? undefined } : {}),
    };
    for (const key of Object.keys(payload) as (keyof ShowInput)[]) {
      if (payload[key] === undefined) delete payload[key];
    }
    log('show dialog submit', { kind, mode: isCreate ? 'create' : 'edit', id: show?.id });
    try {
      if (isCreate) await createShow(kind, payload);
      else await updateShow(kind, show.id, payload);
      toast.success(isCreate ? t('msg.show_created') : t('msg.show_updated'));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      logerr('show save failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? `${t('action.new')} ${noun}` : `${t('action.edit')}: ${show?.title ?? ''}`}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <FormSection title={t('label.basic')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('label.title')}>
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label={t('label.cover_youtube_id')} hint={t('msg.cover_hint')}>
                <Input value={form.youtube_id} onChange={(e) => set('youtube_id', e.target.value)} />
              </Field>
              <Field
                label={t('label.language')}
                hint={isCreate ? undefined : t('msg.language_fixed')}
              >
                {isCreate ? (
                  <L2Select value={l2} onChange={setL2} className="w-full" />
                ) : (
                  <Input value="—" disabled />
                )}
              </Field>
              <Field label={t('label.status')}>
                <Input value={form.status} onChange={(e) => set('status', e.target.value)} />
              </Field>
              {!isTalk && (
                <Field label={t('label.year')}>
                  <Input
                    type="number"
                    value={form.year}
                    onChange={(e) => set('year', e.target.value)}
                  />
                </Field>
              )}
            </div>
          </FormSection>

          <FormSection title={t('label.categorization')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('label.channel_id')}>
                <Input
                  value={form.channel_id}
                  onChange={(e) => set('channel_id', e.target.value)}
                />
              </Field>
              <Field label={t('label.category')}>
                <Input value={form.category} onChange={(e) => set('category', e.target.value)} />
              </Field>
              <Field label={t('label.locale')}>
                <Input value={form.locale} onChange={(e) => set('locale', e.target.value)} />
              </Field>
              <Field label={t('label.lex_div')}>
                <Input value={form.lex_div} onChange={(e) => set('lex_div', e.target.value)} />
              </Field>
              <Field label={t('label.avg_views')}>
                <Input value={form.avg_views} onChange={(e) => set('avg_views', e.target.value)} />
              </Field>
              <Field label={t('title.tags')}>
                <Input
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder={t('placeholder.comma_separated_tags')}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 pt-1 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={form.hidden} onChange={(e) => set('hidden', e.target.checked)} />
                {t('label.hidden')}
              </label>
              {isTalk && (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={form.audiobook}
                    onChange={(e) => set('audiobook', e.target.checked)}
                  />
                  {t('label.audiobook')}
                </label>
              )}
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={form.made_for_kids}
                  onChange={(e) => set('made_for_kids', e.target.checked)}
                />
                {t('label.made_for_kids')}
              </label>
            </div>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('action.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
