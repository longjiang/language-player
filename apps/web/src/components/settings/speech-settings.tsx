'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { VoicePicker } from '@/components/voice-picker';

export function SpeechSettings() {
  const { loaded } = useSettingsContext();
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
  }, [t]);

  if (!loaded) {
    return <div className="px-6 py-10 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="px-6 py-6">
      <h2 className="text-xl font-bold mb-6">{t('title.speech')}</h2>
      <VoicePicker />
    </div>
  );
}
