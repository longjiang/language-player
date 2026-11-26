import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { RECORDING_MAX_SEC, formatDuration, type RecordStimulus } from '@langplayer/textbooks';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { makeSyncId } from '@/lib/sync-db';
import {
  UploadError,
  deleteRecording,
  getRecordingUrl,
  listRecordings,
  uploadRecording,
  type RecordingRow,
} from '@/lib/user-files-client';
import { useTextbookTask } from './task-provider';

/**
 * The recorder for a `record` stimulus (SPEC-111, mobile).
 *
 * Mirrors the web control: idle → recording → saving → saved, with a preview,
 * a retry that reuses the recorded file, and a delete. The take is not graded;
 * `required` gates completion, and completion only counts a *stored* take
 * (SPEC-113's row), never the local file.
 *
 * 24 kHz mono AAC in an m4a container: speech at ~24 kbps, which keeps a
 * 30-minute take near 5 MB — far inside the kind's 32 MiB cap, on both platforms.
 * (The `LOW_QUALITY` preset is deliberately not used: on Android it records 3gp,
 * which the store's `task_recording` contract does not accept.)
 */
export const SPEECH_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 24000,
  numberOfChannels: 1,
  bitRate: 24000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.m4a',
    sampleRate: 24000,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 24000 },
};

const RECORDED_MIME = 'audio/mp4';

export function RecordField({ stimulus }: { stimulus: RecordStimulus }) {
  const ctx = useTextbookTask();
  const t = useT();
  const { token } = useAuth();

  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const recorderState = useAudioRecorderState(recorder, 500);

  const taskId = ctx?.task.id ?? '';
  const slot = stimulus.slotId?.trim() || 'task';
  const maxSeconds = stimulus.maxDurationSec ?? RECORDING_MAX_SEC;

  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'saved' | 'pending' | 'error'>(
    'idle',
  );
  const [errorCode, setErrorCode] = useState<'permission' | 'upload' | null>(null);
  const [stored, setStored] = useState<{ row: RecordingRow; url: string } | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const lastUriRef = useRef<string | null>(null);
  const durationRef = useRef(0);

  const player = useAudioPlayer(previewUri ?? stored?.url ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);

  const stopAndSave = useCallback(async () => {
    try {
      durationRef.current = recorderState.durationMillis || durationRef.current;
      await recorder.stop();
    } catch (err) {
      log('[LP Mobile] Recorder stop failed', err);
    }
  }, [recorder, recorderState.durationMillis]);

  // Stop at the task's own limit, not only when the student taps Stop.
  useEffect(() => {
    if (phase !== 'recording') return;
    if (recorderState.durationMillis >= maxSeconds * 1000) {
      void stopAndSave();
    }
  }, [phase, recorderState.durationMillis, maxSeconds, stopAndSave]);

  // Upload as soon as the file exists, so closing the task does not lose it.
  useEffect(() => {
    if (recorderState.isRecording) return;
    const uri = recorder.uri;
    if (!uri) return;
    if (lastUriRef.current === uri) return;
    lastUriRef.current = uri;
    setPreviewUri(uri);
    durationRef.current = recorderState.durationMillis || durationRef.current;
    if (!token) {
      setPhase('pending');
      return;
    }
    const fileId = makeSyncId();
    setPhase('uploading');
    setErrorCode(null);
    void uploadRecording({
      uri,
      fileId,
      mime: RECORDED_MIME,
      fileName: `${fileId}.m4a`,
      taskId,
      slot,
      durationMs: durationRef.current,
      token,
    })
      .then(async () => {
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
                  mime: RECORDED_MIME,
                  byteSize: 0,
                  durationMs: durationRef.current,
                  createdAt: Date.now(),
                },
                url,
              }
            : null,
        );
        setPhase('saved');
      })
      .catch((err) => {
        const status = err instanceof UploadError ? err.status : 0;
        log('[LP Mobile] Recording upload failed', status);
        setErrorCode('upload');
        setPhase('error');
      });
  }, [recorderState.isRecording, recorderState.durationMillis, recorder.uri, token, taskId, slot]);

  // A take already on the server: show it when the task opens.
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

  const start = useCallback(async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setErrorCode('permission');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPreviewUri(null);
      lastUriRef.current = null;
      durationRef.current = 0;
      setErrorCode(null);
      setPhase('recording');
    } catch (err) {
      log('[LP Mobile] Could not start recording', err);
      setErrorCode('permission');
    }
  }, [recorder]);

  const stop = useCallback(() => {
    if (recorderState.isRecording) void stopAndSave();
  }, [recorderState.isRecording, stopAndSave]);

  const retry = useCallback(() => {
    const uri = lastUriRef.current;
    if (!uri || !token) return;
    const fileId = makeSyncId();
    setPhase('uploading');
    setErrorCode(null);
    void uploadRecording({
      uri,
      fileId,
      mime: RECORDED_MIME,
      fileName: `${fileId}.m4a`,
      taskId,
      slot,
      durationMs: durationRef.current,
      token,
    })
      .then(async () => {
        const url = await getRecordingUrl(fileId, token);
        if (url) {
          setStored({
            row: {
              fileId,
              kind: 'task_recording',
              ownerType: 'task',
              ownerId: taskId,
              slot,
              mime: RECORDED_MIME,
              byteSize: 0,
              durationMs: durationRef.current,
              createdAt: Date.now(),
            },
            url,
          });
        }
        setPhase('saved');
      })
      .catch((err) => {
        log('[LP Mobile] Recording retry failed', err instanceof UploadError ? err.status : 0);
        setErrorCode('upload');
        setPhase('error');
      });
  }, [token, taskId, slot]);

  const remove = useCallback(async () => {
    if (stored && token) await deleteRecording(stored.row.fileId, token);
    setStored(null);
    setPreviewUri(null);
    lastUriRef.current = null;
    setPhase('idle');
  }, [stored, token]);

  const elapsed = recorderState.durationMillis;
  const hasTake = Boolean(previewUri || stored);

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-4">
      {stimulus.prompt ? (
        <Text className="text-sm font-medium text-foreground">{stimulus.prompt}</Text>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-3">
        {phase !== 'recording' ? (
          <Pressable
            onPress={() => void start()}
            disabled={phase === 'uploading'}
            className="rounded-md bg-primary px-4 py-2 active:opacity-80"
          >
            <Text className="text-sm font-medium text-primary-foreground">
              {hasTake ? t('task.rerecord') : t('task.record')}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={stop} className="rounded-md border border-border px-4 py-2 active:opacity-80">
            <Text className="text-sm font-medium text-foreground">{t('task.stop_recording')}</Text>
          </Pressable>
        )}

        {phase === 'recording' ? (
          <Text className="font-mono text-sm text-foreground">
            {formatDuration(elapsed)} / {formatDuration(maxSeconds * 1000)}
          </Text>
        ) : null}

        {phase === 'uploading' ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-muted-foreground">{t('task.recording_uploading')}</Text>
          </View>
        ) : null}

        {phase === 'saved' ? (
          <Text className="text-sm text-muted-foreground">{t('task.recording_saved')}</Text>
        ) : null}

        {phase === 'pending' ? (
          <Text className="text-sm text-muted-foreground">{t('task.recording_upload_pending')}</Text>
        ) : null}

        {phase === 'error' ? (
          <Pressable onPress={retry} className="rounded-md border border-border px-3 py-1.5 active:opacity-80">
            <Text className="text-sm text-foreground">{t('task.recording_retry')}</Text>
          </Pressable>
        ) : null}

        {stored ? (
          <Pressable
            onPress={() => void remove()}
            className="rounded-md border border-border px-3 py-1.5 active:opacity-80"
          >
            <Text className="text-sm text-foreground">{t('task.delete_recording')}</Text>
          </Pressable>
        ) : null}
      </View>

      {(previewUri || stored?.url) && phase !== 'recording' ? (
        <Pressable
          onPress={() => {
            if (playerStatus.playing) player.pause();
            else player.play();
          }}
          className="rounded-md border border-border px-3 py-2 active:opacity-80"
        >
          <Text className="text-sm text-foreground">
            {playerStatus.playing ? t('task.stop_recording') : t('task.play_my_recording')}
          </Text>
        </Pressable>
      ) : null}

      {errorCode === 'permission' ? (
        <Text className="text-sm text-muted-foreground">{t('task.recording_permission_denied')}</Text>
      ) : null}
      {errorCode === 'upload' ? (
        <Text className="text-sm text-muted-foreground">{t('task.recording_upload_failed')}</Text>
      ) : null}
    </View>
  );
}
