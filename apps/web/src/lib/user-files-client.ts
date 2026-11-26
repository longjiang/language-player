/**
 * Recording upload/playback client for the user file store (SPEC-111 + SPEC-113).
 *
 * Uploads are chunked (4 MiB parts) and complete with a sha256, so a dropped
 * connection resumes instead of losing a long take. The MIME the server accepts
 * is the base type (`audio/webm`); the recorder gets the codec-qualified type,
 * because Safari cannot produce WebM and Chromium cannot produce MP4.
 */

import { RECORDING_CHUNK_BYTES, chunkCount } from '@langplayer/textbooks';
import { PYTHON_API_URL } from '@/lib/api-url';

export interface RecordingRow {
  fileId: string;
  kind: string;
  ownerType: string;
  ownerId: string;
  slot: string;
  mime: string;
  byteSize: number;
  durationMs: number | null;
  createdAt: number;
}

export interface RecorderMime {
  /** The MIME sent to the server (base type only). */
  mime: string;
  /** The MIME handed to MediaRecorder (may carry a codec). */
  recorderMime: string;
}

const CANDIDATES: RecorderMime[] = [
  { mime: 'audio/webm', recorderMime: 'audio/webm;codecs=opus' },
  { mime: 'audio/ogg', recorderMime: 'audio/ogg;codecs=opus' },
  { mime: 'audio/mp4', recorderMime: 'audio/mp4' },
];

/** The first container this browser can record, or null when it cannot record. */
export function pickRecordingMime(): RecorderMime | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.recorderMime)) return candidate;
    } catch {
      /* isTypeSupported can throw on an exotic build; try the next one */
    }
  }
  return null;
}

export function newRecordingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Secure-context fallback: same shape the mobile app uses for sync ids.
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface UploadRecordingInput {
  blob: Blob;
  fileId: string;
  mime: string;
  taskId: string;
  slot: string;
  durationMs: number;
  token: string;
  onProgress?: (fraction: number) => void;
}

export async function uploadRecording(input: UploadRecordingInput): Promise<void> {
  const { blob, fileId, mime, taskId, slot, durationMs, token, onProgress } = input;
  const total = Math.max(1, chunkCount(blob.size, RECORDING_CHUNK_BYTES));

  for (let index = 0; index < total; index++) {
    const part = blob.slice(index * RECORDING_CHUNK_BYTES, (index + 1) * RECORDING_CHUNK_BYTES);
    const params = new URLSearchParams({
      index: String(index),
      total: String(total),
      kind: 'task_recording',
      mime,
    });
    const res = await fetch(`${PYTHON_API_URL}/files/${fileId}/chunk?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: part,
    });
    if (!res.ok) throw new UploadError(`part ${index} failed`, res.status);
    onProgress?.(((index + 1) / total) * 0.9);
  }

  const res = await fetch(`${PYTHON_API_URL}/files/${fileId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'task_recording',
      ownerType: 'task',
      ownerId: taskId,
      slot,
      mime,
      total,
      byteSize: blob.size,
      sha256: await sha256Hex(blob),
      durationMs,
    }),
  });
  if (!res.ok) throw new UploadError('complete failed', res.status);
  onProgress?.(1);
}

export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function listRecordings(taskId: string, token: string): Promise<RecordingRow[]> {
  const params = new URLSearchParams({
    ownerType: 'task',
    ownerId: taskId,
    kind: 'task_recording',
  });
  const res = await fetch(`${PYTHON_API_URL}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { files?: RecordingRow[] };
  return Array.isArray(body.files) ? body.files : [];
}

export async function getRecordingUrl(fileId: string, token: string): Promise<string | null> {
  const res = await fetch(`${PYTHON_API_URL}/files/${fileId}/url`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string };
  return typeof body.url === 'string' ? body.url : null;
}

export async function deleteRecording(fileId: string, token: string): Promise<boolean> {
  const res = await fetch(`${PYTHON_API_URL}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}
