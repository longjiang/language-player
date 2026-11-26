// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickRecordingMime, uploadRecording } from './user-files-client';

const originalMediaRecorder = globalThis.MediaRecorder;
const originalFetch = globalThis.fetch;
const originalCrypto = globalThis.crypto;

afterEach(() => {
  globalThis.MediaRecorder = originalMediaRecorder;
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  vi.restoreAllMocks();
});

function stubCrypto() {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => 'recording-id',
      subtle: { digest: async () => new Uint8Array(32).buffer },
    },
    configurable: true,
  });
}


/** jsdom's Blob has no arrayBuffer(); this stand-in has the parts the client uses. */
function makeBlob(bytes: number): Blob {
  const data = new Uint8Array(bytes);
  return {
    size: bytes,
    slice: (start: number, end: number) => new Blob([data.slice(start, end)]),
    arrayBuffer: async () => data.buffer,
  } as unknown as Blob;
}

describe('pickRecordingMime', () => {
  it('is null when the browser cannot record', () => {
    // @ts-expect-error - simulating a browser without MediaRecorder
    globalThis.MediaRecorder = undefined;
    expect(pickRecordingMime()).toBeNull();
  });

  it('prefers webm/opus, then ogg, then mp4', () => {
    class Fake {
      static isTypeSupported = (type: string) => type.startsWith('audio/mp4');
    }
    // @ts-expect-error - a minimal MediaRecorder stand-in
    globalThis.MediaRecorder = Fake;
    expect(pickRecordingMime()).toEqual({ mime: 'audio/mp4', recorderMime: 'audio/mp4' });

    class Webm extends Fake {
      static isTypeSupported = (type: string) => type.startsWith('audio/webm');
    }
    // @ts-expect-error - a minimal MediaRecorder stand-in
    globalThis.MediaRecorder = Webm;
    expect(pickRecordingMime()).toEqual({
      mime: 'audio/webm',
      recorderMime: 'audio/webm;codecs=opus',
    });
  });
});

describe('uploadRecording', () => {
  it('uploads one part per chunk and completes with the digest', async () => {
    stubCrypto();
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: init?.body instanceof Blob ? 'blob' : init?.body,
      });
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const blob = makeBlob(10);
    await uploadRecording({
      blob,
      fileId: 'file-1',
      mime: 'audio/webm',
      taskId: 'task-1',
      slot: 'task',
      durationMs: 1000,
      token: 'token',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain('/files/file-1/chunk?');
    expect(calls[0]!.url).toContain('index=0');
    expect(calls[0]!.url).toContain('kind=task_recording');
    expect(calls[1]!.url).toContain('/files/file-1/complete');
    const body = JSON.parse(String(calls[1]!.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'task_recording',
      ownerId: 'task-1',
      slot: 'task',
      total: 1,
      byteSize: 10,
      sha256: '0'.repeat(64),
    });
  });

  it('throws on a failed part so the caller can keep the blob for a retry', async () => {
    stubCrypto();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 413 } as Response)) as unknown as typeof fetch;
    const blob = makeBlob(4);
    await expect(
      uploadRecording({
        blob,
        fileId: 'file-1',
        mime: 'audio/webm',
        taskId: 'task-1',
        slot: 'task',
        durationMs: 1,
        token: 'token',
      }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
