'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { RecordStimulus } from '@langplayer/textbooks';
import { RECORDING_MAX_SEC, formatDuration } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import {
  UploadError,
  deleteRecording,
  getRecordingUrl,
  listRecordings,
  newRecordingId,
  pickRecordingMime,
  uploadRecording,
  type RecorderMime,
  type RecordingRow,
} from '@/lib/user-files-client';
import { useTextbookTask } from './task-provider';

/**
 * The recorder for a `record` stimulus (SPEC-111).
 *
 * One control, four states the student can be in: nothing recorded, recording,
 * saving, saved. The task is **not complete** until the take is saved — a take
 * held only in this tab is marked "not saved yet" and offered a retry, because
 * the completion rule is the server's copy (the store's, SPEC-113), not this
 * component's memory.
 *
 * The recording is never graded. `required` only gates completion.
 */
export function RecordField({ stimulus }: { stimulus: RecordStimulus }) {
  const ctx = useTextbookTask();
  const t = useT();
  const { data: session, status } = useSession();

  const sessionToken = (session as unknown as { accessToken?: unknown } | null)?.accessToken;
  const token = status === 'authenticated' && typeof sessionToken === 'string' ? sessionToken : null;

  const taskId = ctx?.task.id ?? '';
  const slot = stimulus.slotId?.trim() || 'task';
  const maxSeconds = stimulus.maxDurationSec ?? RECORDING_MAX_SEC;

  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'saved' | 'pending' | 'error'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errorCode, setErrorCode] = useState<'permission' | 'unsupported' | 'upload' | 'unavailable' | null>(null);
  const [stored, setStored] = useState<{ row: RecordingRow; url: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<RecorderMime | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileIdRef = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
  }, []);

  // Stop the microphone if the component goes away mid-recording.
  useEffect(
    () => () => {
      stopTimer();
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopTimer],
  );

  // Load a take that is already stored, so reopening the task can play it.
  useEffect(() => {
    if (!token || !taskId) return;
    let cancelled = false;
    void listRecordings(taskId, token).then(async (rows) => {
      const row = rows.find((candidate) => candidate.slot === slot);
      if (!row || cancelled) return;
      const url = await getRecordingUrl(row.fileId, token);
      if (!cancelled && url) setStored({ row, url });
    });
    return () => {
      cancelled = true;
    };
  }, [token, taskId, slot]);

  // A preview object URL is owned by this component and must be revoked.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const save = useCallback(
    async (blob: Blob) => {
      if (!token) {
        // Signed out: the bytes stay in this tab. Nothing is claimed as saved.
        setPhase('pending');
        return;
      }
      const mime = mimeRef.current?.mime ?? 'audio/webm';
      const fileId = newRecordingId();
      fileIdRef.current = fileId;
      setPhase('uploading');
      setProgress(0);
      setErrorCode(null);
      try {
        const durationMs = Date.now() - startedAtRef.current;
        await uploadRecording({
          blob,
          fileId,
          mime,
          taskId,
          slot,
          durationMs,
          token,
          onProgress: setProgress,
        });
        const url = await getRecordingUrl(fileId, token);
        setStored(
          url
            ? {
                row: {
                  fileId,
                  kind: 'task_recording',
                  ownerType: 'task',
                  ownerId: taskId,
                  slot,
                  mime,
                  byteSize: blob.size,
                  durationMs,
                  createdAt: Date.now(),
                },
                url,
              }
            : null,
        );
        setPhase('saved');
      } catch (err) {
        // The blob is kept so the retry does not ask the student to record again.
        const status = err instanceof UploadError ? err.status : 0;
        log('[LP Web] Recording upload failed', status);
        setErrorCode(status === 413 ? 'upload' : 'upload');
        setPhase('error');
      }
    },
    [token, taskId, slot],
  );

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopTimer();
  }, [stopTimer]);

  const startRecording = useCallback(async () => {
    if (status === 'loading') return;
    const mime = pickRecordingMime();
    if (!mime) {
      setErrorCode('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      mimeRef.current = mime;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      const recorder = new MediaRecorder(stream, {
        mimeType: mime.recorderMime,
        audioBitsPerSecond: 24_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mime.recorderMime });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
        setPhase('idle');
        void save(blob);
      };
      recorder.start();
      setElapsed(0);
      setPhase('recording');
      setErrorCode(null);
      timerRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
      autoStopRef.current = setTimeout(() => stopRecording(), maxSeconds * 1000);
    } catch (err) {
      log('[LP Web] Microphone unavailable', err);
      setErrorCode('permission');
    }
  }, [status, save, stopRecording, maxSeconds]);

  const retry = useCallback(() => {
    if (blobRef.current) void save(blobRef.current);
  }, [save]);

  const remove = useCallback(async () => {
    const saved = stored?.row.fileId ?? fileIdRef.current;
    if (saved && token) {
      await deleteRecording(saved, token);
      setStored(null);
    }
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    blobRef.current = null;
    setPhase('idle');
    setElapsed(0);
  }, [stored, token]);

  const remaining = Math.max(0, maxSeconds - elapsed);
  const canRecord = phase !== 'recording' && phase !== 'uploading';
  const url = previewUrl ?? stored?.url ?? null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      {stimulus.prompt && (
        <p className="text-sm font-medium text-foreground">{stimulus.prompt}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {phase !== 'recording' ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={!canRecord}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {stored || blobRef.current ? t('task.rerecord') : t('task.record')}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t('task.stop_recording')}
          </button>
        )}

        {phase === 'recording' && (
          <span className="font-mono text-sm text-foreground" aria-live="polite">
            {formatDuration(elapsed * 1000)} / {formatDuration(maxSeconds * 1000)}
          </span>
        )}

        {phase === 'uploading' && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t('task.recording_uploading')} {Math.round(progress * 100)}%
          </span>
        )}

        {phase === 'saved' && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t('task.recording_saved')}
          </span>
        )}

        {phase === 'pending' && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t('task.recording_upload_pending')}
          </span>
        )}

        {phase === 'error' && (
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            {t('task.recording_retry')}
          </button>
        )}

        {stored && (
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            {t('task.delete_recording')}
          </button>
        )}
      </div>

      {url && <audio controls src={url} className="w-full" />}

      {phase === 'recording' && (
        <p className="text-xs text-muted-foreground">
          {remaining > 0 ? formatDuration(remaining * 1000) : ''}
        </p>
      )}

      {errorCode === 'permission' && (
        <p className="text-sm text-muted-foreground">{t('task.recording_permission_denied')}</p>
      )}
      {errorCode === 'unsupported' && (
        <p className="text-sm text-muted-foreground">{t('task.recording_mic_unavailable')}</p>
      )}
      {errorCode === 'upload' && (
        <p className="text-sm text-muted-foreground">{t('task.recording_upload_failed')}</p>
      )}
    </section>
  );
}
