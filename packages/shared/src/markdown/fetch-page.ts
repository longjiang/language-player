/**
 * Shared web-reader fetch helper (SPEC-087 §2 "one shared pipeline").
 *
 * Both apps load a web article identically: fetch the page through the Flask
 * `/proxy` endpoint (which handles CORS/bot-walls and decodes content
 * correctly) and return the raw response text. This is the ONLY place the
 * reader fetch is defined so the two platforms can never diverge.
 *
 * Pure platform-agnostic: uses the standard `fetch`/`encodeURIComponent`
 * globals available in both the browser (web) and React Native (mobile).
 */

/** Fetch a remote web page through the Flask `/proxy` endpoint and return its
 *  raw text. `apiBase` is the app's `PYTHON_API_URL`. */
export async function fetchReaderPage(url: string, apiBase: string): Promise<string> {
  const res = await fetch(`${apiBase}/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
