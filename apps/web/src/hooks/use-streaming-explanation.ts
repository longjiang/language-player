'use client';

import { useState, useRef, useCallback } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';

interface StreamState {
  text: string;
  error: string | null;
  loading: boolean;
}

interface StreamActions {
  /** Start streaming a DeepSeek explanation for the given prompt. */
  stream: (prompt: string) => Promise<void>;
  /** Reset state and abort any in-flight request. */
  reset: () => void;
  /** Abort the current stream without resetting accumulated text. */
  abort: () => void;
}

/**
 * Shared hook for streaming DeepSeek AI explanations via SSE.
 * Used by both AiExplanation (dictionary popup) and TextActionMenu (reader/watch).
 */
export function useStreamingExplanation(): StreamState & StreamActions {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

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

  const stream = useCallback(async (prompt: string) => {
    abort(); // cancel any previous stream
    setLoading(true);
    setError(null);
    setText('');

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const res = await fetch(`${PYTHON_API_URL}/chatgpt/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
            const payload = line.slice(6);
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.t) {
                setText((prev) => prev + parsed.t);
              } else if (parsed.e) {
                setError(parsed.e);
              }
            } catch { /* malformed SSE line, skip */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err?.message ?? 'Failed to get AI explanation.');
      }
    } finally {
      setLoading(false);
    }
  }, [abort]);

  return { text, error, loading, stream, reset, abort };
}
