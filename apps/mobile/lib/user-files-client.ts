/**
 * Recording upload/playback for the user file store (SPEC-111 + SPEC-113, mobile).
 *
 * The recorder produces one m4a on both platforms, so the whole take goes up in
 * a single multipart `POST /files` — RN can hand FormData a file URI directly,
 * which avoids base64-encoding megabytes in JS. (The web uploads chunked because
 * it has the bytes in memory; the size cap is the same 32 MiB.)
 */

import { PYTHON_API_URL } from './api-url';

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

export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface UploadRecordingInput {
  uri: string;
  fileId: string;
  /** Server-facing base type: the recorded file is m4a → `audio/mp4`. */
  mime: string;
  fileName: string;
  taskId: string;
  slot: string;
  durationMs: number;
  token: string;
}

export async function uploadRecording(input: UploadRecordingInput): Promise<void> {
  const form = new FormData();
  form.append('fileId', input.fileId);
  form.append('kind', 'task_recording');
  form.append('ownerType', 'task');
  form.append('ownerId', input.taskId);
  form.append('slot', input.slot);
  form.append('durationMs', String(input.durationMs));
  // React Native's FormData accepts a { uri, name, type } file descriptor; the
  // DOM type does not describe it, hence the cast.
  form.append('file', {
    uri: input.uri,
    name: input.fileName,
    type: input.mime,
  } as unknown as Blob);

  const res = await fetch(`${PYTHON_API_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.token}` },
    body: form,
  });
  if (!res.ok) throw new UploadError('upload failed', res.status);
}

export async function listRecordings(taskId: string, token: string): Promise<RecordingRow[]> {
  const params = new URLSearchParams({
    ownerType: 'task',
    ownerId: taskId,
    kind: 'task_recording',
  });
  const res = await fetch(`${PYTHON_API_URL}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { files?: RecordingRow[] };
  return Array.isArray(body.files) ? body.files : [];
}

export async function getRecordingUrl(fileId: string, token: string): Promise<string | null> {
  const res = await fetch(`${PYTHON_API_URL}/files/${fileId}/url`, {
    headers: { Authorization: `Bearer ${token}` },
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
