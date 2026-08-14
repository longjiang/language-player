/**
 * apiFetch — extension-safe fetch wrapper.
 *
 * Routes API calls through the background service worker so page-mode
 * content scripts are not blocked by CORS on arbitrary websites.
 */

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value, key) => {
      result[key] = value;
    });
  } else {
    Object.assign(result, headers as Record<string, string>);
  }
  return result;
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const body = typeof options.body === 'string'
    ? options.body
    : options.body
      ? JSON.stringify(options.body)
      : undefined;

  return chrome.runtime.sendMessage({
    action: 'bgFetch',
    url,
    method: options.method || 'GET',
    headers: normalizeHeaders(options.headers),
    body,
  }).then((res: any) => {
    const ok = !!res?.ok;
    const status = res?.status ?? (ok ? 200 : 0);
    const text = res?.text ?? '';
    return {
      ok,
      status,
      json: async () => {
        try {
          return JSON.parse(text);
        } catch {
          return {};
        }
      },
      text: async () => text,
    } as unknown as Response;
  });
}
