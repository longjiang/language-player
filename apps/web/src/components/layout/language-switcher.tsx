'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { languageName, pickRedirectTarget } from '@/lib/language-data';
import { ChevronDown } from 'lucide-react';
import { LanguagePicker } from '@/components/language-picker';

export function LanguageSwitcher() {
  const { l1, l2, setLanguagePair } = useLanguage();
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (modalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [modalOpen, handleKeyDown]);

  function handleConfirm(newL1: string, newL2: string) {
    const target = pickRedirectTarget(pathname);
    setLanguagePair(newL1, newL2, target ?? 'explore');
    setModalOpen(false);
  }

  return (
    <>
      {/* L2-only trigger button */}
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        {languageName(l2.code, l1.code)}
        <ChevronDown className="h-3 w-3" />
      </button>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[10vh] pb-8">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setModalOpen(false)}
          />

          {/* Modal content */}
          <div className="relative z-10 mx-4 w-full max-w-2xl rounded-2xl bg-background shadow-2xl p-6">
            <LanguagePicker
              initialL1={l1.code}
              initialL2={l2.code}
              onConfirm={handleConfirm}
              onDismiss={() => setModalOpen(false)}
              showClose
            />
          </div>
        </div>
      )}
    </>
  );
}
