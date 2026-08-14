import { useState, useRef, useCallback } from 'react';
import { apiClient } from './client';

export interface StreamState {
  text: string;
  error: string | null;
  loading: boolean;
}

export interface StreamActions {
  /** Start streaming a DeepSeek explanation for the given prompt.
   *  Pass { regenerate: true } to bypass server-side cache and get a fresh response. */
  stream: (prompt: string, options?: { regenerate?: boolean }) => Promise<void>;
  /** Reset state and abort any in-flight request. */
  reset: () => void;
  /** Abort the current stream without resetting accumulated text. */
  abort: () => void;
}

/** Per-stream diagnostics reported when a stream call finishes. */
export interface StreamDiagnostics {
  /** When the stream call started (epoch ms). */
  startedAt: number;
  /** When the stream call finished (epoch ms). */
  finishedAt: number;
  durationMs: number;
  /** Total characters received in parsed `t` chunks. */
  chars: number;
  /** Number of SSE `data:` lines received. */
  sseLines: number;
  /** Number of `data:` payloads that yielded a text chunk. */
  parsedChunks: number;
  /** Number of `data:` payloads that parsed but had no `t`/`e` field. */
  skippedPayloads: number;
  /** Number of `data:` payloads that failed to parse as JSON. */
  malformedLines: number;
  /** Whether the stream ended with `data: [DONE]`. */
  sawDone: boolean;
  /** HTTP status when known. */
  httpStatus?: number;
  /** Stream/HTTP error message, if any. */
  error?: string;
}

/**
 * Shared hook for streaming DeepSeek AI explanations via SSE.
 * Uses the apiClient's base URL so it works in both web and mobile.
 *
 * An optional diagnostics callback receives a summary of every completed
 * stream — useful for debugging empty responses without adding app-specific
 * logging to this shared package.
 */
export function useStreamingExplanation(
  onDiagnostics?: (diagnostics: StreamDiagnostics) => void,
): StreamState & StreamActions {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const onDiagnosticsRef = useRef(onDiagnostics);
  onDiagnosticsRef.current = onDiagnostics;

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setText('');
    setError(null);
    setLoading(false);
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }, []);

  const stream = useCallback(async (prompt: string, options?: { regenerate?: boolean }) => {
    abort();
    setLoading(true);
    setError(null);
    setText('');

    const controller = new AbortController();
    controllerRef.current = controller;

    const startedAt = Date.now();
    let sseLines = 0;
    let parsedChunks = 0;
    let skippedPayloads = 0;
    let malformedLines = 0;
    let sawDone = false;
    let chars = 0;
    let httpStatus: number | undefined;
    let streamError: string | undefined;

    const reportDiagnostics = () => {
      // A superseded/aborted stream must not report as the current one.
      if (controllerRef.current !== controller) return;
      const finishedAt = Date.now();
      onDiagnosticsRef.current?.({
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        chars,
        sseLines,
        parsedChunks,
        skippedPayloads,
        malformedLines,
        sawDone,
        httpStatus,
        error: streamError,
      });
    };

    try {
      const baseURL = apiClient.instance.defaults.baseURL ?? '';
      const body: Record<string, unknown> = { prompt };
      if (options?.regenerate) {
        body.regenerate = true;
      }
      const res = await fetch(`${baseURL}/chatgpt/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      httpStatus = res.status;
      if (!res.ok) {
        streamError = `HTTP ${res.status}`;
        throw new Error(streamError);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            sseLines += 1;
            const payload = line.slice(6);
            if (payload === '[DONE]') {
              sawDone = true;
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              if (parsed.t) {
                parsedChunks += 1;
                chars += parsed.t.length;
                setText((prev) => prev + parsed.t);
              } else if (parsed.e) {
                streamError = parsed.e;
                setError(parsed.e);
              } else {
                skippedPayloads += 1;
              }
            } catch {
              malformedLines += 1; /* malformed SSE line, skip */
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        streamError = err?.message ?? 'Failed to get AI explanation.';
        setError(streamError ?? null);
      }
    } finally {
      // Only the latest stream may clear loading. A superseded/aborted stream
      // must not flip loading off while a newer stream is still in flight —
      // doing so re-triggers fetch effects and causes restart cascades.
      if (controllerRef.current === controller) {
        reportDiagnostics();
        setLoading(false);
      }
    }
  }, [abort]);

  return { text, error, loading, stream, reset, abort };
}
