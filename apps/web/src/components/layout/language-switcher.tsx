'use client';

import { usePathname } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { languageName, pickRedirectTarget } from '@/lib/language-data';
import { ChevronDown } from 'lucide-react';
import { LanguagePicker } from '@/components/language-picker';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
} from '@/components/ui/dialog';

export function LanguageSwitcher() {
  const { l1, l2, setLanguagePair } = useLanguage();
  const pathname = usePathname();

  function handleConfirm(newL1: string, newL2: string) {
    const target = pickRedirectTarget(pathname);
    setLanguagePair(newL1, newL2, target ?? 'explore');
  }

  return (
    <Dialog>
      {/* L2-only trigger button */}
      <DialogTrigger className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted">
        {languageName(l2.code, l1.code)}
        <ChevronDown className="h-3 w-3" />
      </DialogTrigger>

      {/* Modal content */}
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        showCloseButton={false}
      >
        <LanguagePicker
          initialL1={l1.code}
          initialL2={l2.code}
          onConfirm={handleConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
