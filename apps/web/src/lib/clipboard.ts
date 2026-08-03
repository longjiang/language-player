/**
 * Copy text to the clipboard. Prefers the async Clipboard API, falling back
 * to the legacy `execCommand('copy')` path for browsers or contexts where
 * `navigator.clipboard` is unavailable (insecure contexts, older Safari,
 * iframes without clipboard-write permission, etc.).
 *
 * The fallback temporarily selects a hidden textarea, which would destroy the
 * user's text selection — the current selection range is saved and restored
 * so the highlighted text stays highlighted.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const selection = document.getSelection();
    const savedRange = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).cloneRange()
      : null;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);

    // Restore the user's original selection if we clobbered it.
    if (savedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    return ok;
  } catch {
    return false;
  }
}
