import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { createAssetResolver, indexToCircled, type AudioTrack } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';

/**
 * Task audio.
 *
 * Plays through `expo-video`, which is already a dependency and already linked
 * natively — `expo-av`/`expo-audio` are not installed, and adding one would need
 * a new development build. `expo-audio` is the better long-term home for
 * audio-only playback; this is the path that works without a rebuild.
 *
 * ⚠️ Not verified on a device or simulator. If audio does not start, the likely
 * cause is that `expo-video` expects a mounted `VideoView` for playback; the fix
 * is local to this file (mount a zero-height `VideoView` bound to `player`).
 *
 * One track at a time, deliberately: the workbook's items are numbered, and
 * letting a student start item 4 while item 2 is playing produces answers to the
 * wrong question. Never autoplays.
 */
export function AudioPlayer({ tracks }: { tracks: AudioTrack[] }) {
  const t = useT();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const urls = useMemo(() => tracks.map((track) => resolve(track.key)), [tracks, resolve]);

  const [active, setActive] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Source follows the active track; `null` loads nothing until a tap.
  const source = active === null ? null : { uri: urls[active] };
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (active === null) return;
    try {
      player.play();
    } catch {
      setFailed(true);
      setActive(null);
    }
  }, [active, player]);

  if (tracks.length === 0) return null;

  const toggle = (index: number) => {
    if (active === index) {
      player.pause();
      setActive(null);
      return;
    }
    setFailed(false);
    setActive(index);
  };

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-3">
      {tracks.length === 1 ? (
        <Pressable
          onPress={() => toggle(0)}
          accessibilityRole="button"
          accessibilityState={{ selected: active === 0 }}
          accessibilityLabel={tracks[0]!.label ?? t('action.speak')}
          className={`items-center rounded-md px-4 py-2 ${
            active === 0 ? 'bg-primary/20' : 'bg-primary'
          }`}
        >
          <Text
            className={active === 0 ? 'text-sm font-medium text-primary' : 'text-sm font-medium text-primary-foreground'}
          >
            {active === 0 ? '❚❚' : '▶'}
          </Text>
        </Pressable>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {tracks.map((track, index) => (
            <Pressable
              key={track.key}
              onPress={() => toggle(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: active === index }}
              accessibilityLabel={track.label ?? `track ${index + 1}`}
              className={`h-9 w-9 items-center justify-center rounded-full border ${
                active === index ? 'border-primary bg-primary' : 'border-border bg-background'
              }`}
            >
              <Text
                className={`text-sm ${active === index ? 'text-primary-foreground' : 'text-foreground'}`}
              >
                {indexToCircled(index + 1)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {failed && <Text className="text-xs text-muted-foreground">{t('msg.failed_to_load_url')}</Text>}
    </View>
  );
}
