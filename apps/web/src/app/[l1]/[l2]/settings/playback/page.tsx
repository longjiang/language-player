'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { SectionHeader } from '../_components/SectionHeader';
import { SegmentedRow } from '../_components/SegmentedRow';
import { ToggleRow } from '../_components/ToggleRow';

export default function PlaybackSettingsPage() {
  const { playback, updatePlayback, loaded } = useSettingsContext();
  const t = useT();

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      toast.success(t('msg.settings_saved'));
    }, 1200);
    return () => clearTimeout(timer);
  }, [playback, t]);

  if (!loaded) {
    return <div className="mx-auto max-w-lg px-4 py-12 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-3xl font-bold mb-8">{t('title.playback')}</h1>

      <div className="space-y-8">
        <SectionHeader title={t('setting.captions')}>
          <SegmentedRow<string>
            label={t('label.captions_display_as')}
            value={playback.transcriptMode}
            onChange={v => updatePlayback({ transcriptMode: v as 'subtitles' | 'transcript' })}
            options={[
              { value: 'transcript', label: t('title.transcript') },
              { value: 'subtitles', label: t('label.subtitles') },
            ]}
          />
          <p className="text-xs text-muted-foreground">{t('msg.captions_display_as_desc', { transcriptLabel: t('title.transcript'), subtitlesLabel: t('label.subtitles') })}</p>
          {playback.transcriptMode === 'transcript' && (
            <ToggleRow
              label={t('label.smooth_scroll')}
              checked={playback.smoothScroll}
              onChange={v => updatePlayback({ smoothScroll: v })}
            />
          )}
          <ToggleRow
            label={t('label.karaoke')}
            checked={playback.karaokeMode}
            onChange={v => updatePlayback({ karaokeMode: v })}
          />
        </SectionHeader>

        <SectionHeader title={t('setting.playback')}>
          <ToggleRow
            label={t('label.auto_pause')}
            checked={playback.autoPause}
            onChange={v => updatePlayback({ autoPause: v })}
          />
        </SectionHeader>
      </div>
    </div>
  );
}
