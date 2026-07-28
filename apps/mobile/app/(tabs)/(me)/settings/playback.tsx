import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { SectionHeader } from '@/components/settings/SectionHeader';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { SegmentedRow } from '@/components/settings/SegmentedRow';

export function PlaybackSettings() {
  const { playback, updatePlayback } = useSettingsContext();
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        {/* Captions */}
        <View className="mb-5">
          <SectionHeader title={t('setting.captions')} />
          <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.captions_display_as')}</Text>
          <SegmentedRow
            options={['transcript', 'subtitles'] as const}
            value={playback.transcriptMode}
            onChange={(v) => updatePlayback({ transcriptMode: v })}
            renderLabel={(v) => t(v === 'transcript' ? 'title.transcript' : 'label.subtitles')}
          />
          <Text className="text-xs text-muted-foreground mt-1.5">
            {t('msg.captions_display_as_desc', {
              transcriptLabel: t('title.transcript'),
              subtitlesLabel: t('label.subtitles'),
            })}
          </Text>
          {playback.transcriptMode === 'transcript' && (
            <ToggleRow
              label={t('label.smooth_scroll')}
              value={playback.smoothScroll}
              onValueChange={(v) => updatePlayback({ smoothScroll: v })}
            />
          )}
          <ToggleRow
            label={t('label.karaoke')}
            value={playback.karaokeMode}
            onValueChange={(v) => updatePlayback({ karaokeMode: v })}
          />
        </View>

        {/* Playback */}
        <View className="mb-5">
          <SectionHeader title={t('setting.playback')} />
          <ToggleRow
            label={t('label.auto_pause')}
            value={playback.autoPause}
            onValueChange={(v) => updatePlayback({ autoPause: v })}
          />
        </View>
      </View>
    </ScrollView>
  );
}

export default PlaybackSettings;
