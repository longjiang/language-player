'use client';

import { L2Select } from '@/components/content/l2-select';
import { Field, FormSection } from '@/components/content/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useT } from '@/hooks/use-t';
import { createVideo, updateVideo } from '@/lib/content-api';
import { log, logerr } from '@/lib/logger';
import type { AdminVideo, VideoInput } from '@/types/content';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

/** An empty form. Numeric fields stay strings until submit. */
interface FormState {
  title: string;
  youtube_id: string;
  status: string;
  type: string;
  level: string;
  topic: string;
  lesson: string;
  category: string;
  locale: string;
  tags: string;
  channel_id: string;
  date: string;
  tv_show: string;
  talk: string;
  views: string;
  likes: string;
  comments: string;
  difficulty: string;
  lex_div: string;
  word_freq: string;
  duration: string;
  notes: string;
  subs_l2: string;
  made_for_kids: boolean;
}

const EMPTY: FormState = {
  title: '',
  youtube_id: '',
  status: '',
  type: '',
  level: '',
  topic: '',
  lesson: '',
  category: '',
  locale: '',
  tags: '',
  channel_id: '',
  date: '',
  tv_show: '',
  talk: '',
  views: '',
  likes: '',
  comments: '',
  difficulty: '',
  lex_div: '',
  word_freq: '',
  duration: '',
  notes: '',
  subs_l2: '',
  made_for_kids: false,
};

function formFrom(video: AdminVideo | null): FormState {
  if (!video) return EMPTY;
  const s = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  return {
    ...EMPTY,
    title: s(video.title),
    youtube_id: s(video.youtube_id),
    status: s(video.status),
    type: s(video.type),
    level: s(video.level),
    topic: s(video.topic),
    lesson: s(video.lesson),
    category: s(video.category),
    locale: s(video.locale),
    tags: s(video.tags),
    channel_id: s(video.channel_id),
    date: s(video.date).slice(0, 10),
    tv_show: video.tv_show ? String(video.tv_show.id) : '',
    talk: video.talk ? String(video.talk.id) : '',
    views: s(video.views),
    likes: s(video.likes),
    comments: s(video.comments),
    difficulty: s(video.difficulty),
    lex_div: s(video.lex_div),
    word_freq: s(video.word_freq),
    duration: s(video.duration),
    notes: s(video.notes),
    subs_l2: s(video.subs_l2),
    made_for_kids: !!video.made_for_kids,
  };
}

/** `''` → omitted; otherwise the number (NaN is dropped by the caller). */
function num(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function str(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

/**
 * Create / edit one `youtube_videos` row. Field set is exactly
 * `utils_content.ADMIN_VIDEO_WRITABLE`; the language is chosen at creation
 * (the list row only carries the legacy numeric id, so editing it blindly
 * would re-file the video under another language's id block).
 */
export function VideoDialog({
  open,
  onOpenChange,
  video,
  defaultL2,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: AdminVideo | null;
  defaultL2: string | null;
  onSaved: () => void;
}) {
  const t = useT();
  const isCreate = video === null;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [l2, setL2] = useState<string | null>(defaultL2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFrom(video));
    setL2(defaultL2);
  }, [open, video, defaultL2]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    if (saving) return;
    if (isCreate && (!form.youtube_id.trim() || !l2)) {
      toast.error(t('msg.video_id_and_language_required'));
      return;
    }
    setSaving(true);
    const payload: VideoInput = {
      title: str(form.title),
      status: str(form.status),
      type: str(form.type),
      level: str(form.level),
      topic: str(form.topic),
      lesson: str(form.lesson),
      category: str(form.category),
      locale: str(form.locale),
      tags: str(form.tags),
      channel_id: str(form.channel_id),
      date: str(form.date),
      views: num(form.views),
      likes: num(form.likes),
      comments: num(form.comments),
      difficulty: num(form.difficulty),
      lex_div: num(form.lex_div),
      word_freq: num(form.word_freq),
      duration: str(form.duration),
      notes: form.notes,
      made_for_kids: form.made_for_kids ? 1 : 0,
    };
    if (form.subs_l2.trim()) payload.subs_l2 = form.subs_l2;
    if (isCreate) {
      payload.youtube_id = form.youtube_id.trim();
      payload.l2 = l2 ?? undefined;
      if (form.tv_show.trim()) payload.tv_show = form.tv_show.trim();
      if (form.talk.trim()) payload.talk = form.talk.trim();
    } else {
      // Explicit null unassigns; a title is matched or created server-side.
      payload.tv_show = form.tv_show.trim() ? form.tv_show.trim() : null;
      payload.talk = form.talk.trim() ? form.talk.trim() : null;
    }
    // Drop undefined so Flask never sees an empty string for a numeric column.
    for (const key of Object.keys(payload) as (keyof VideoInput)[]) {
      if (payload[key] === undefined) delete payload[key];
    }
    log('video dialog submit', {
      mode: isCreate ? 'create' : 'edit',
      id: video?.id,
      fields: Object.keys(payload),
      subs_l2_length: payload.subs_l2?.length,
    });
    try {
      if (isCreate) {
        const id = await createVideo(payload);
        toast.success(t('msg.video_created'));
        log('video created', { id });
      } else {
        await updateVideo(video.id, payload);
        toast.success(t('msg.video_updated'));
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      logerr('video save failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  const showRelationHint = t('msg.show_or_talk_hint');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? t('action.new_video') : `${t('action.edit')}: ${video?.title ?? ''}`}
          </DialogTitle>
          <DialogDescription>{t('msg.video_dialog_hint')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <FormSection title={t('label.basic')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('label.title')}>
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label={t('label.youtube_id')}>
                <Input
                  value={form.youtube_id}
                  onChange={(e) => set('youtube_id', e.target.value)}
                  disabled={!isCreate}
                  placeholder={t('placeholder.youtube_id_or_url')}
                />
              </Field>
              <Field
                label={t('label.language')}
                hint={isCreate ? undefined : t('msg.language_fixed')}
              >
                {isCreate ? (
                  <L2Select value={l2} onChange={setL2} allowAll={false} className="w-full" />
                ) : (
                  <Input value="—" disabled />
                )}
              </Field>
              <Field label={t('label.status')}>
                <Input value={form.status} onChange={(e) => set('status', e.target.value)} />
              </Field>
              <Field label={t('label.type')}>
                <Input value={form.type} onChange={(e) => set('type', e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t('label.categorization')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('label.level')}>
                <Input value={form.level} onChange={(e) => set('level', e.target.value)} />
              </Field>
              <Field label={t('label.topic')}>
                <Input value={form.topic} onChange={(e) => set('topic', e.target.value)} />
              </Field>
              <Field label={t('label.lesson')}>
                <Input value={form.lesson} onChange={(e) => set('lesson', e.target.value)} />
              </Field>
              <Field label={t('label.category')}>
                <Input value={form.category} onChange={(e) => set('category', e.target.value)} />
              </Field>
              <Field label={t('label.locale')}>
                <Input value={form.locale} onChange={(e) => set('locale', e.target.value)} />
              </Field>
              <Field label={t('title.tags')}>
                <Input
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder={t('placeholder.comma_separated_tags')}
                />
              </Field>
              <Field label={t('label.channel_id')}>
                <Input
                  value={form.channel_id}
                  onChange={(e) => set('channel_id', e.target.value)}
                />
              </Field>
              <Field label={t('title.date')}>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t('label.assignment')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('title.tv_show')} hint={showRelationHint}>
                <Input value={form.tv_show} onChange={(e) => set('tv_show', e.target.value)} />
              </Field>
              <Field label={t('label.talk')} hint={showRelationHint}>
                <Input value={form.talk} onChange={(e) => set('talk', e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t('label.metrics')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('title.views')}>
                <Input value={form.views} onChange={(e) => set('views', e.target.value)} />
              </Field>
              <Field label={t('title.likes')}>
                <Input value={form.likes} onChange={(e) => set('likes', e.target.value)} />
              </Field>
              <Field label={t('label.comments')}>
                <Input value={form.comments} onChange={(e) => set('comments', e.target.value)} />
              </Field>
              <Field label={t('label.difficulty')}>
                <Input
                  value={form.difficulty}
                  onChange={(e) => set('difficulty', e.target.value)}
                />
              </Field>
              <Field label={t('label.lex_div')}>
                <Input value={form.lex_div} onChange={(e) => set('lex_div', e.target.value)} />
              </Field>
              <Field label={t('label.word_freq')}>
                <Input value={form.word_freq} onChange={(e) => set('word_freq', e.target.value)} />
              </Field>
              <Field label={t('label.duration')} hint={t('msg.iso_duration_hint')}>
                <Input value={form.duration} onChange={(e) => set('duration', e.target.value)} />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Checkbox
                  checked={form.made_for_kids}
                  onChange={(e) => set('made_for_kids', e.target.checked)}
                />
                {t('label.made_for_kids')}
              </label>
            </div>
          </FormSection>

          <FormSection title={t('label.subtitles_l2')}>
            <Textarea
              value={form.subs_l2}
              onChange={(e) => set('subs_l2', e.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder="starttime,duration,line"
            />
          </FormSection>

          <FormSection title={t('title.notes')}>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
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
