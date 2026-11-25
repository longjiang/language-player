'use client';

import { SUPPORTED_L1S } from '@langplayer/shared';
import { AdminShell } from '@/components/layout/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import {
  createCoupon,
  fetchCoupons,
  translateCouponTitle,
  updateCoupon,
} from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import { logerr } from '@/lib/logger';
import type { Coupon, CouponList } from '@/types/affiliate';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Plus } from 'lucide-react';

/** The translated sentence templates the admin preview renders. */
export interface SaleTemplates {
  [locale: string]: { banner: string; ends: string; code: string };
}

function status(c: Coupon): string {
  if (!c.active) return 'archived';
  if (new Date(c.expiresAt) <= new Date()) return 'expired';
  if (c.remaining <= 0) return 'exhausted';
  return 'active';
}

function intlTimeZones(): string[] {
  const anyIntl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  return (
    anyIntl.supportedValuesOf?.('timeZone') ?? [
      'UTC',
      'America/Vancouver',
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
    ]
  );
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Render an ISO instant as a `datetime-local` value in `timeZone`. */
function toLocalInput(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - date.getTime();
}

/** Local wall-clock value + IANA zone -> UTC instant (preview only; the
 *  backend is authoritative and uses Python zoneinfo). */
function zonedToUtc(local: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return null;
  const base = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let ts = base;
  for (let i = 0; i < 3; i += 1) {
    ts = base - tzOffsetMs(new Date(ts), timeZone);
  }
  return new Date(ts);
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

const TIME_ZONES = intlTimeZones();
const DEFAULT_TIME_ZONE = browserTimeZone();

interface CreateForm {
  code: string;
  internalName: string;
  discountType: 'percent' | 'amount';
  value: string;
  maxRedemptions: string;
  expiresLocal: string;
  expiresTimezone: string;
  featured: boolean;
  publicTitle: string;
}

interface EditForm {
  internalName: string;
  maxRedemptions: string;
  expiresLocal: string;
  expiresTimezone: string;
  active: boolean;
  featured: boolean;
  publicTitle: string;
  publicTitleI18n: Record<string, string>;
}

const EMPTY_CREATE: CreateForm = {
  code: '',
  internalName: '',
  discountType: 'percent',
  value: '20',
  maxRedemptions: '100',
  expiresLocal: '',
  expiresTimezone: DEFAULT_TIME_ZONE,
  featured: false,
  publicTitle: '',
};

export function CouponsClient({ templates }: { templates: SaleTemplates }) {
  const t = useT();
  const [data, setData] = useState<CouponList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);

  const [editing, setEditing] = useState<Coupon | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState('');
  const [translating, setTranslating] = useState<string | null>(null);

  const localeCount = SUPPORTED_L1S.length;
  const translatedCount = useMemo(
    () => SUPPORTED_L1S.filter((locale) => edit?.publicTitleI18n[locale]?.trim()).length,
    [edit],
  );

  function load() {
    fetchCoupons({ limit: 100 })
      .then(setData)
      .catch((err) => {
        logerr('admin coupons load failed', err); // non-info-level: failed request, stack trace needed
        setError(err instanceof Error ? err.message : t('error.general'));
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      await createCoupon({
        code: form.code.trim(),
        internalName: form.internalName.trim(),
        discountType: form.discountType,
        percentOff: form.discountType === 'percent' ? Number(form.value) : undefined,
        amountOffCents:
          form.discountType === 'amount' ? Math.round(Number(form.value) * 100) : undefined,
        maxRedemptions: Number(form.maxRedemptions),
        expiresAtLocal: form.expiresLocal,
        expiresTimezone: form.expiresTimezone,
        featured: form.featured,
        publicTitle: form.publicTitle.trim() || undefined,
      });
      setOpen(false);
      setForm(EMPTY_CREATE);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(coupon: Coupon) {
    setEditing(coupon);
    setEditError('');
    setEdit({
      internalName: coupon.internalName,
      maxRedemptions: String(coupon.maxRedemptions),
      expiresLocal: toLocalInput(coupon.expiresAt, coupon.expiresTimezone || 'UTC'),
      expiresTimezone: coupon.expiresTimezone || 'UTC',
      active: coupon.active,
      featured: coupon.featured,
      publicTitle: coupon.publicTitle ?? '',
      publicTitleI18n: { ...coupon.publicTitleI18n },
    });
  }

  async function saveEdit() {
    if (!editing || !edit) return;
    setBusy(true);
    setEditError('');
    try {
      const cleanI18n: Record<string, string> = {};
      for (const [locale, value] of Object.entries(edit.publicTitleI18n)) {
        if (value.trim()) cleanI18n[locale] = value.trim();
      }
      await updateCoupon(editing.id, {
        internalName: edit.internalName.trim(),
        maxRedemptions: Number(edit.maxRedemptions),
        expiresAtLocal: edit.expiresLocal,
        expiresTimezone: edit.expiresTimezone,
        active: edit.active,
        featured: edit.featured,
        publicTitle: edit.publicTitle.trim(),
        publicTitleI18n: cleanI18n,
      });
      setEditing(null);
      setEdit(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  async function archive(coupon: Coupon) {
    try {
      await updateCoupon(coupon.id, { active: !coupon.active });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    }
  }

  async function translate(locale: string) {
    if (!edit || !edit.publicTitle.trim()) return;
    setTranslating(locale);
    setEditError('');
    try {
      const res = await translateCouponTitle(edit.publicTitle.trim(), locale);
      setEdit((current) =>
        current
          ? {
              ...current,
              publicTitleI18n: { ...current.publicTitleI18n, [locale]: res.title },
            }
          : current,
      );
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setTranslating(null);
    }
  }

  async function translateAll() {
    if (!edit || !edit.publicTitle.trim()) return;
    const missing = SUPPORTED_L1S.filter((locale) => !edit.publicTitleI18n[locale]?.trim());
    if (!missing.length) return;
    setTranslating('*');
    setEditError('');
    try {
      for (const locale of missing) {
        const res = await translateCouponTitle(edit.publicTitle.trim(), locale);
        setEdit((current) =>
          current
            ? {
                ...current,
                publicTitleI18n: { ...current.publicTitleI18n, [locale]: res.title },
              }
            : current,
        );
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setTranslating(null);
    }
  }

  function previewFor(locale: string): string {
    if (!editing || !edit) return '';
    const tpl = templates[locale] ??
      templates.en ??
      { banner: '', ends: '', code: '' };
    const title = (edit.publicTitleI18n[locale] || edit.publicTitle).trim();
    const pct = editing.discountType === 'percent' ? editing.percentOff : null;
    const utc = zonedToUtc(edit.expiresLocal, edit.expiresTimezone);
    const parts: string[] = [];
    if (tpl.banner) {
      parts.push(
        tpl.banner.replace('{title}', title || '…').replace('{pct}', String(pct ?? '…')),
      );
    }
    if (tpl.ends && utc) {
      parts.push(tpl.ends.replace('{date}', formatDate(utc.toISOString(), locale)));
    }
    if (tpl.code) parts.push(tpl.code.replace('{code}', editing.code));
    return parts.join(' · ');
  }

  const editUtc = edit ? zonedToUtc(edit.expiresLocal, edit.expiresTimezone) : null;
  const canFeature = (discountType: 'percent' | 'amount') => discountType === 'percent';

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('label.coupons')}</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('action.create_coupon')}
        </Button>
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('label.coupons')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : data.coupons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_coupons')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Code</th>
                    <th className="py-2">{t('label.discount')}</th>
                    <th className="py-2">{t('label.uses')}</th>
                    <th className="py-2">{t('label.expires')}</th>
                    <th className="py-2">{t('label.status')}</th>
                    <th className="py-2">{t('label.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.map((c) => {
                    const st = status(c);
                    return (
                      <tr key={c.id} className="border-t border-border">
                        <td className="py-2">
                          <span className="font-mono">{c.code}</span>
                          {c.featured && (
                            <Badge variant="success" className="ml-2">
                              {t('label.featured')}
                            </Badge>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            {c.internalName}
                            {c.publicTitle ? ` · ${c.publicTitle}` : ''}
                          </span>
                        </td>
                        <td className="py-2">
                          {c.discountType === 'percent'
                            ? `${c.percentOff}%`
                            : formatCents(c.amountOffCents, c.currency)}
                        </td>
                        <td className="py-2">
                          {c.used} / {c.maxRedemptions}
                        </td>
                        <td className="py-2">
                          {c.expiresAt?.slice(0, 10)}
                          <span className="block text-xs text-muted-foreground">
                            {c.expiresTimezone}
                          </span>
                        </td>
                        <td className="py-2">
                          <Badge variant={st === 'active' ? 'success' : 'secondary'}>{st}</Badge>
                        </td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" />
                              {t('action.edit')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => archive(c)}>
                              {c.active ? t('action.archive') : t('action.activate')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('action.create_coupon')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input
                className="mt-1"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SUMMER20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('label.name')}</label>
              <Input
                className="mt-1"
                value={form.internalName}
                onChange={(e) => setForm({ ...form, internalName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label.discount')}</label>
                <select
                  value={form.discountType}
                  onChange={(e) =>
                    setForm({ ...form, discountType: e.target.value as 'percent' | 'amount' })
                  }
                  className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="percent">%</option>
                  <option value="amount">USD</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {form.discountType === 'percent' ? '%' : 'USD'}
                </label>
                <Input
                  className="mt-1"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label.uses')}</label>
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  max="10000"
                  value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('label.expires')}</label>
                <Input
                  className="mt-1"
                  type="datetime-local"
                  value={form.expiresLocal}
                  onChange={(e) => setForm({ ...form, expiresLocal: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('label.timezone')}</label>
              <select
                value={form.expiresTimezone}
                onChange={(e) => setForm({ ...form, expiresTimezone: e.target.value })}
                className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.featured}
                  disabled={!canFeature(form.discountType)}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                {t('label.featured')}
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('msg.featured_only_one')}
              </p>
              {form.featured && (
                <div className="mt-2">
                  <label className="text-sm font-medium">{t('label.public_title')}</label>
                  <Input
                    className="mt-1"
                    value={form.publicTitle}
                    onChange={(e) => setForm({ ...form, publicTitle: e.target.value })}
                    placeholder="Black Friday"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Lifetime Pro, USD only. Codes and discounts cannot be changed after creation;
              archive and create a new one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={create}
              disabled={busy || !form.code || !form.internalName || !form.expiresLocal}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit (public sale settings) ── */}
      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
            setEdit(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.code} — {t('label.public_title')}
            </DialogTitle>
          </DialogHeader>
          {edit && editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">{t('label.name')}</label>
                  <Input
                    className="mt-1"
                    value={edit.internalName}
                    onChange={(e) => setEdit({ ...edit, internalName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('label.uses')}</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="1"
                    max="10000"
                    value={edit.maxRedemptions}
                    onChange={(e) => setEdit({ ...edit, maxRedemptions: e.target.value })}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">{t('label.expires')}</label>
                    <Input
                      className="mt-1"
                      type="datetime-local"
                      value={edit.expiresLocal}
                      onChange={(e) => setEdit({ ...edit, expiresLocal: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('label.timezone')}</label>
                    <select
                      value={edit.expiresTimezone}
                      onChange={(e) => setEdit({ ...edit, expiresTimezone: e.target.value })}
                      className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      {TIME_ZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {editUtc && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('msg.expiry_utc', { utc: editUtc.toISOString() })}
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={edit.active}
                  onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
                />
                {t('label.status')}: {edit.active ? 'active' : 'archived'}
              </label>

              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={edit.featured}
                    disabled={!canFeature(editing.discountType)}
                    onChange={(e) => setEdit({ ...edit, featured: e.target.checked })}
                  />
                  {t('label.featured')}
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('msg.featured_only_one')}
                </p>

                <div className="mt-3">
                  <label className="text-sm font-medium">{t('label.public_title')}</label>
                  <Input
                    className="mt-1"
                    value={edit.publicTitle}
                    onChange={(e) => setEdit({ ...edit, publicTitle: e.target.value })}
                    placeholder="Black Friday"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {t('label.title_translations')} ({translatedCount}/{localeCount})
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={translateAll}
                    disabled={!edit.publicTitle.trim() || translating !== null}
                  >
                    {translating === '*' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('action.translate_all')}
                  </Button>
                </div>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {SUPPORTED_L1S.map((locale) => (
                    <div key={locale} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{locale}</span>
                      <Input
                        value={edit.publicTitleI18n[locale] ?? ''}
                        placeholder={edit.publicTitle || 'Black Friday'}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            publicTitleI18n: {
                              ...edit.publicTitleI18n,
                              [locale]: e.target.value,
                            },
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => translate(locale)}
                        disabled={!edit.publicTitle.trim() || translating !== null}
                      >
                        {translating === locale && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {t('action.translate')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{t('label.preview_sentence')}</p>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                  {SUPPORTED_L1S.map((locale) => (
                    <p key={locale} className="flex gap-2">
                      <span className="w-16 shrink-0 text-muted-foreground">{locale}</span>
                      <span dir="auto">{previewFor(locale)}</span>
                    </p>
                  ))}
                </div>
              </div>

              {editError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {editError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setEdit(null);
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button onClick={saveEdit} disabled={busy || !edit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
