'use client';

import { useRouter } from 'next/navigation';
import { LanguagePicker } from '@/components/language-picker';
import { SettingsProvider } from '@/providers/settings-provider';

export default function LanguageSelectPage() {
  const router = useRouter();

  function handleConfirm(l1: string, l2: string) {
    router.push(`/${l1}/${l2}/explore`);
  }

  return (
    <SettingsProvider>
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <LanguagePicker
          onConfirm={handleConfirm}
          showTitle
        />
      </main>
    </SettingsProvider>
  );
}
