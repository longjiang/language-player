'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SubtitleLine } from '@langplayer/shared';
import {
  saveMedia,
  loadMedia,
  updateMediaMeta,
  deleteMedia,
  openMediaFile,
  openCaptionFile,
  restoreFileFromHandle,
  isAudioFile,
  type StoredMedia,
} from '@/lib/media-store';
import { parseSubtitles } from '@langplayer/utils';
import { logerr } from '@/lib/logger';

/** Storage failures reach the error channel: they present as "nothing happens"
 *  or "my file vanished" and need the stack trace to diagnose. */
function mediaStorageErr(message: string, err: unknown): void {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  logerr(`custom media: ${message} — ${detail}`); // non-info-level: caught storage exception — stack trace needed
}

export interface UseCustomMediaReturn {
  /** Object URL for the current media file (for <video>/<audio> src). */
  mediaUrl: string | null;
  /** Whether the media is audio-only (vs video). */
  isAudio: boolean;
  /** File name. */
  fileName: string | null;
  /** Parsed subtitle lines. */
  subtitleLines: SubtitleLine[];
  /** Whether a file has been loaded. */
  hasMedia: boolean;
  /** Loading state during initial restore. */
  initializing: boolean;
  /** Whether the user needs to re-grant file permission. */
  needsPermission: boolean;
  /** Saved playback position in seconds. */
  savedPosition: number;
  /** Open file picker for a media file. */
  openFile: () => Promise<void>;
  /** Load a file directly (from drag-and-drop). */
  loadDroppedFile: (file: File) => Promise<void>;
  /** Open file picker for a caption file. */
  loadCaptions: () => Promise<void>;
  /** Remove stored media and captions. */
  clear: () => Promise<void>;
  /** Save current playback position. */
  savePosition: (seconds: number) => void;
  /** Request permission to re-access a stored file handle. */
  requestPermission: () => Promise<void>;
  /** Whether the stored pick could not be restored (its record or source file
   *  can no longer be read) — the user is offered the same recovery as a
   *  revoked permission: pick the file again, or remove the entry. */
  restoreFailed: boolean;
  /** Translation key of the last failure, or null (for the caller to render). */
  error: string | null;
  /** Dismiss the current error message. */
  clearError: () => void;
}

export function useCustomMedia(): UseCustomMediaReturn {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isAudio, setIsAudio] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([]);
  const [hasMedia, setHasMedia] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPosition, setSavedPosition] = useState(0);

  const storedRef = useRef<StoredMedia | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoke previous object URL to prevent memory leaks
  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Load a file (from picker or restored handle) into state
  const loadFileData = useCallback((file: File, stored?: StoredMedia) => {
    revokeUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setMediaUrl(url);
    setIsAudio(isAudioFile(file));
    setFileName(file.name);
    setHasMedia(true);
    setNeedsPermission(false);

    // Parse stored captions
    if (stored?.captionText && stored.captionFormat) {
      const lines = parseSubtitles(stored.captionText, stored.captionFormat);
      setSubtitleLines(lines);
    } else {
      setSubtitleLines([]);
    }

    setSavedPosition(stored?.position ?? 0);
  }, [revokeUrl]);

  // ── Initial restore from IndexedDB ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: StoredMedia | null = null;
      try {
        stored = await loadMedia();
      } catch (err) {
        // A large stored value whose Chromium blob file was deleted fails with
        // an irrecoverable `NotReadableError`; every other failure means the
        // same thing to the user: this pick cannot be restored. Either way the
        // reader must not stay on its spinner.
        mediaStorageErr('the stored pick could not be read', err);
        if (!cancelled) {
          setRestoreFailed(true);
          setError('msg.epub_file_unreadable');
        }
        return;
      } finally {
        if (!cancelled) setInitializing(false);
      }
      if (cancelled || !stored) return;

      storedRef.current = stored;

      // Try to restore from file handle
      if (stored.fileHandle) {
        const file = await restoreFileFromHandle(stored.fileHandle);
        if (file) {
          if (!cancelled) loadFileData(file, stored);
          return;
        }
        // Permission needed — show re-open prompt
        if (!cancelled) {
          setFileName(stored.fileName);
          setIsAudio(stored.isAudio);
          setNeedsPermission(true);
          setHasMedia(false);
        }
        return;
      }

      // Fallback: restore from stored ArrayBuffer
      if (stored.fileData) {
        const blob = new Blob([stored.fileData], { type: stored.mimeType });
        const file = new File([blob], stored.fileName, { type: stored.mimeType });
        if (!cancelled) loadFileData(file, stored);
      }
    })().catch((err) => {
      // Belt and braces: `loadFileData`/`new File` must not leave the spinner up.
      mediaStorageErr('restoring the stored pick failed', err);
      if (!cancelled) {
        setRestoreFailed(true);
        setError('msg.epub_file_unreadable');
      }
    });
    return () => { cancelled = true; };
  }, [loadFileData]);

  // ── Request permission (user clicks "Re-open File") ──
  const requestPermission = useCallback(async () => {
    const stored = storedRef.current;
    if (!stored?.fileHandle) return;

    let file: File | null = null;
    try {
      file = await restoreFileFromHandle(stored.fileHandle);
    } catch (err) {
      mediaStorageErr('re-opening the stored file failed', err);
    }
    if (file) {
      setRestoreFailed(false);
      setError(null);
      loadFileData(file, stored);
      return;
    }
    // The handle is dead (the file was moved or deleted): say so — a tap that
    // silently does nothing reads as a broken button.
    mediaStorageErr(`"${stored.fileName}" can no longer be opened — pick it again`, new Error('handle unavailable'));
    setRestoreFailed(true);
    setError('msg.epub_file_unreadable');
  }, [loadFileData]);

  const clearError = useCallback(() => setError(null), []);

  // ── Open file picker ──
  const openFile = useCallback(async () => {
    let result: Awaited<ReturnType<typeof openMediaFile>> = null;
    try {
      result = await openMediaFile();
    } catch (err) {
      // Picker failures (a SecurityError, or a cancelled `<input>` in a browser
      // without the File System Access API) must not leave the caller hanging.
      mediaStorageErr('the file picker failed', err);
      setError('msg.epub_file_unreadable');
      return;
    }
    if (!result) return;

    const { file, handle } = result;

    const stored: StoredMedia = {
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
      isAudio: isAudioFile(file),
      fileSize: file.size,
      lastOpened: Date.now(),
      position: 0,
      fileHandle: handle,
      captionText: '',
      captionFormat: null,
    };

    // Fallback: store file data if no File System Access handle. Reading the
    // bytes can itself fail when the file was moved/deleted after the pick.
    if (!handle) {
      try {
        stored.fileData = await file.arrayBuffer();
      } catch (err) {
        mediaStorageErr(`"${file.name}" could not be read`, err);
        setError('msg.epub_file_unreadable');
        return;
      }
    }

    // Load first, persist second: a storage failure must not hide the file the
    // user just picked (it used to no-op silently when `saveMedia` rejected).
    storedRef.current = stored;
    loadFileData(file, stored);
    setError(null);
    setRestoreFailed(false);
    try {
      await saveMedia(stored);
    } catch (err) {
      mediaStorageErr('the pick could not be saved (it will not survive a reload)', err);
      setError('msg.epub_file_unreadable');
    }
  }, [loadFileData]);

  // ── Load dropped file (no FileSystemFileHandle available) ──
  const loadDroppedFile = useCallback(async (file: File) => {
    let fileData: ArrayBuffer;
    try {
      // No file handle from drop — always store raw data as fallback. A dropped
      // file can be gone by the time it is read (moved/deleted mid-drag).
      fileData = await file.arrayBuffer();
    } catch (err) {
      mediaStorageErr(`dropped file "${file.name}" could not be read`, err);
      setError('msg.epub_file_unreadable');
      return;
    }
    const stored: StoredMedia = {
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
      isAudio: isAudioFile(file),
      fileSize: file.size,
      lastOpened: Date.now(),
      position: 0,
      fileData,
      captionText: '',
      captionFormat: null,
    };

    storedRef.current = stored;
    loadFileData(file, stored);
    setError(null);
    setRestoreFailed(false);
    try {
      await saveMedia(stored);
    } catch (err) {
      mediaStorageErr('the dropped file could not be saved (it will not survive a reload)', err);
      setError('msg.epub_file_unreadable');
    }
  }, [loadFileData]);

  // ── Load captions ──
  const loadCaptions = useCallback(async () => {
    const result = await openCaptionFile();
    if (!result) return;

    let lines: ReturnType<typeof parseSubtitles>;
    try {
      lines = parseSubtitles(result.text, result.format);
    } catch (err) {
      mediaStorageErr(`"${result.fileName}" is not a readable subtitle file`, err);
      setError('msg.epub_file_unreadable');
      return;
    }
    // Show them first: persisting is best-effort, and a storage failure used to
    // reject here after the captions were already visible.
    setSubtitleLines(lines);
    setError(null);
    try {
      await updateMediaMeta({
        captionText: result.text,
        captionFormat: result.format,
      });
    } catch (err) {
      mediaStorageErr('the captions could not be saved (they will not survive a reload)', err);
      setError('msg.epub_file_unreadable');
    }
  }, []);

  // ── Clear ──
  const clear = useCallback(async () => {
    revokeUrl();
    setMediaUrl(null);
    setIsAudio(false);
    setFileName(null);
    setSubtitleLines([]);
    setHasMedia(false);
    setNeedsPermission(false);
    setSavedPosition(0);
    storedRef.current = null;
    setRestoreFailed(false);
    setError(null);
    try {
      await deleteMedia();
    } catch (err) {
      mediaStorageErr('the stored pick could not be deleted', err);
      setError('msg.epub_file_unreadable');
    }
  }, [revokeUrl]);

  // ── Save position (throttled by caller) ──
  const savePositionFn = useCallback((seconds: number) => {
    setSavedPosition(seconds);
    updateMediaMeta({ position: seconds, lastOpened: Date.now() }).catch(() => {});
  }, []);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => revokeUrl();
  }, [revokeUrl]);

  return {
    mediaUrl,
    isAudio,
    fileName,
    subtitleLines,
    hasMedia,
    initializing,
    needsPermission,
    savedPosition,
    openFile,
    loadDroppedFile,
    loadCaptions,
    clear,
    savePosition: savePositionFn,
    requestPermission,
    restoreFailed,
    error,
    clearError,
  };
}
