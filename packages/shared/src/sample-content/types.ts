/**
 * Per-language sample content for the settings preview (`short`) and the
 * reader (`long`). Each language lives in its own module so web bundles can
 * lazy-load only the language the user is viewing.
 */
export interface SampleContent {
  /** L2 name of the featured place. */
  title: string;
  /** ~50-word markdown paragraph with inline formatting (bold/italics). */
  short: string;
  /** Long multi-section reader text. Not authored yet for most languages. */
  long: string | null;
}
