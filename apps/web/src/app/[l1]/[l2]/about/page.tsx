'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { AboutDialog } from '@/components/about/about-dialog';

/**
 * Deep-link route for the About dialog (SPEC-073). The About UI itself stays
 * a modal; this route exists so Classic's `/contact-us` links can redirect to
 * a stable URL that opens the dialog. Closing navigates back to Explore.
 */
export default function AboutRoute() {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const { l1, l2 } = useLanguage();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      router.replace(`/${l1.code}/${l2.code}/explore`);
    }
  };

  return <AboutDialog open={open} onOpenChange={handleOpenChange} />;
}
