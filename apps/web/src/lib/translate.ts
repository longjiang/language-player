import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * Translate a single text string via the Python backend LLM.
 * Falls back to the original text on any error.
 */
export async function translateText(
  text: string,
  l1: string,
  l2: string,
): Promise<string> {
  if (!text || l1 === l2) return text;

  try {
    const params = new URLSearchParams({ text, l1, l2 });
    const res = await fetch(`${PYTHON_API_URL}/translate?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data?.translated_text?.trim() || text;
  } catch {
    return text;
  }
}
