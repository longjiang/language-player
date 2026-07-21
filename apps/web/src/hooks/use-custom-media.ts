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
import { parseSubtitles } from '@/lib/subtitle-parser';

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
}

export function useCustomMedia(): UseCustomMediaReturn {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isAudio, setIsAudio] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([]);
  const [hasMedia, setHasMedia] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);
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
      const stored = await loadMedia();
      if (cancelled) return;

      if (!stored) {
        setInitializing(false);
        return;
      }

      storedRef.current = stored;

      // Try to restore from file handle
      if (stored.fileHandle) {
        const file = await restoreFileFromHandle(stored.fileHandle);
        if (file) {
          if (!cancelled) loadFileData(file, stored);
          setInitializing(false);
          return;
        }
        // Permission needed — show re-open prompt
        if (!cancelled) {
          setFileName(stored.fileName);
          setIsAudio(stored.isAudio);
          setNeedsPermission(true);
          setHasMedia(false);
        }
        setInitializing(false);
        return;
      }

      // Fallback: restore from stored ArrayBuffer
      if (stored.fileData) {
        const blob = new Blob([stored.fileData], { type: stored.mimeType });
        const file = new File([blob], stored.fileName, { type: stored.mimeType });
        if (!cancelled) loadFileData(file, stored);
        setInitializing(false);
        return;
      }

      setInitializing(false);
    })();
    return () => { cancelled = true; };
  }, [loadFileData]);

  // ── Request permission (user clicks "Re-open File") ──
  const requestPermission = useCallback(async () => {
    const stored = storedRef.current;
    if (!stored?.fileHandle) return;

    const file = await restoreFileFromHandle(stored.fileHandle);
    if (file) {
      loadFileData(file, stored);
    }
  }, [loadFileData]);

  // ── Open file picker ──
  const openFile = useCallback(async () => {
    const result = await openMediaFile();
    if (!result) return;

    const { file, handle } = result;

    // Save to IndexedDB
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

    // Fallback: store file data if no File System Access handle
    if (!handle) {
      stored.fileData = await file.arrayBuffer();
    }

    await saveMedia(stored);
    storedRef.current = stored;
    loadFileData(file, stored);
  }, [loadFileData]);

  // ── Load dropped file (no FileSystemFileHandle available) ──
  const loadDroppedFile = useCallback(async (file: File) => {
    const stored: StoredMedia = {
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
      isAudio: isAudioFile(file),
      fileSize: file.size,
      lastOpened: Date.now(),
      position: 0,
      // No file handle from drop — always store raw data as fallback
      fileData: await file.arrayBuffer(),
      captionText: '',
      captionFormat: null,
    };

    await saveMedia(stored);
    storedRef.current = stored;
    loadFileData(file, stored);
  }, [loadFileData]);

  // ── Load captions ──
  const loadCaptions = useCallback(async () => {
    const result = await openCaptionFile();
    if (!result) return;

    const lines = parseSubtitles(result.text, result.format);
    setSubtitleLines(lines);

    // Persist captions
    await updateMediaMeta({
      captionText: result.text,
      captionFormat: result.format,
    });
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
    await deleteMedia();
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
  };
}
