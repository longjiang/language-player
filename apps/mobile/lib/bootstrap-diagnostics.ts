/**
 * Startup diagnostics — installed as the FIRST import of the root layout so it
 * registers its error hook before any app module (e.g. lib/file-open.ts) can
 * throw during module evaluation.
 *
 * Purpose: React Native routes uncaught JavaScript exceptions through the
 * global `ErrorUtils.setGlobalHandler` (the same facility expo-splash-screen
 * uses to hide the splash on error). In a Release build a *silent* startup
 * failure — a module-eval crash during bundle init — leaves a black screen
 * with no crash report, and no in-app code ever runs to log it. This hook
 * forwards any such exception to the device log so the exact message + stack
 * can be read from `log stream` / Xcode device logs.
 *
 * It logs with the required '[LP Mobile]' prefix and chains to the previous
 * handler so normal error behavior (dev redbox, splash hide, …) is preserved.
 * This module intentionally imports only the app logger: it must never throw
 * during its own load or the diagnostic is lost.
 */
import { logerr } from '@/lib/logger';

const g = globalThis as unknown as {
  ErrorUtils?: {
    getGlobalHandler?: () => ((error: unknown, isFatal: boolean) => void) | null;
    setGlobalHandler?: (handler: (error: unknown, isFatal: boolean) => void) => void;
  };
};

if (g?.ErrorUtils?.getGlobalHandler && g?.ErrorUtils?.setGlobalHandler) {
  const previous = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error: unknown, isFatal: boolean) => {
    const err = error as { message?: string; stack?: string } | null;
    try {
      logerr(
        '[bootstrap] uncaught JS error:',
        `[${isFatal ? 'fatal' : 'non-fatal'}]`,
        err?.message ?? String(error),
      );
      if (err?.stack) logerr('[bootstrap] stack:', err.stack);
    } catch {
      // Never let the diagnostic itself throw — fall back to the raw console.
      console.error(`[LP Mobile] [bootstrap] uncaught JS error:`, error);
    }
    if (typeof previous === 'function') {
      try {
        previous(error, isFatal);
      } catch {
        // ignore
      }
    }
  });
}
