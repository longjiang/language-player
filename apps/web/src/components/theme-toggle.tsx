'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettingsContext } from '@/providers/settings-provider';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { updateDisplay } = useSettingsContext();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch — only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-8" />;
  }

  const isDark = theme === 'dark';

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    updateDisplay({ theme: next });
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
