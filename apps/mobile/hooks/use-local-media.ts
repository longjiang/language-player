import { useState, useCallback, useEffect, useRef } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SubtitleLine } from '@langplayer/shared';
import { parseSubtitles } from '@langplayer/utils';
import { logwarn, logerr } from '@/lib/logger';

const MEDIA_DIR = `${FileSystem.documentDirectory}local-media/`;
const STORAGE_KEY = 'local_media_state';

interface StoredState {
  fileName: string | null;
  fileUri: string | null;
  isAudio: boolean;
  captionText: string | null;
  position: number;
}

export interface UseLocalMediaReturn {
  /** Translation key of the last file/storage failure, or null. */
  error: string | null;
  /** Dismiss the current error message. */
  clearError: () => void;
  /** File URI for expo-video source. */
  mediaUri: string | null;
  /** Whether the media is audio-only. */
  isAudio: boolean;
  /** File name. */
  fileName: string | null;
  /** Parsed subtitle lines. */
  subtitleLines: SubtitleLine[];
  /** Whether a file has been loaded. */
  hasMedia: boolean;
  /** Saved playback position in seconds. */
  savedPosition: number;
  /** Open file picker for a media file. */
  openFile: () => Promise<void>;
  /** Open file picker for a caption file. */
  loadCaptions: () => Promise<void>;
  /** Remove stored media and captions. */
  clear: () => Promise<void>;
  /** Save current playback position. */
  savePosition: (seconds: number) => void;
}

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.wma']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);

function isAudioFile(name: string): boolean {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return AUDIO_EXTS.has(ext);
}

export function useLocalMedia(): UseLocalMediaReturn {
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [isAudio, setIsAudio] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([]);
  const [hasMedia, setHasMedia] = useState(false);
  const [savedPosition, setSavedPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const storageRef = useRef<StoredState>({
    fileName: null,
    fileUri: null,
    isAudio: false,
    captionText: null,
    position: 0,
  });

  // Ensure media directory exists. A failure here is reported, not an
  // unhandled rejection: without the directory nothing can be imported.
  useEffect(() => {
    FileSystem.getInfoAsync(MEDIA_DIR)
      .then((info) => {
        if (!info.exists) {
          return FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
        }
        return undefined;
      })
      .catch((err) => {
        logerr(`📼 local media: the media directory is unavailable — ${(err as Error)?.message ?? err}`); // non-info-level: caught storage exception — stack trace needed
        setError('msg.epub_file_unreadable');
      });
  }, []);

  // ── Save state to storage ──
  const persistState = useCallback(async (state: StoredState) => {
    storageRef.current = state;
    try {
      await FileSystem.writeAsStringAsync(
        `${MEDIA_DIR}state.json`,
        JSON.stringify(state),
      );
    } catch (err) {
      // The media keeps playing; only the resume position/captions are lost.
      logerr(`📼 local media: state could not be saved — ${(err as Error)?.message ?? err}`); // non-info-level: caught storage exception — stack trace needed
    }
  }, []);

  // ── Restore state on mount ──
  useEffect(() => {
    (async () => {
      try {
        const json = await FileSystem.readAsStringAsync(`${MEDIA_DIR}state.json`);
        const stored: StoredState = JSON.parse(json);
        if (stored.fileUri) {
          const info = await FileSystem.getInfoAsync(stored.fileUri);
          if (info.exists) {
            storageRef.current = stored;
            setMediaUri(stored.fileUri);
            setFileName(stored.fileName);
            setIsAudio(stored.isAudio);
            setHasMedia(true);
            setSavedPosition(stored.position ?? 0);
            if (stored.captionText) {
              const lines = parseSubtitles(stored.captionText);
              setSubtitleLines(lines);
            }
          } else {
            // The remembered file is gone (deleted, or the OS reclaimed it):
            // say so rather than silently showing an empty page.
            logwarn(`📼 local media: stored file is missing (${stored.fileUri})`);
            setError('msg.epub_file_unreadable');
          }
        }
      } catch (err) {
        // No (readable) saved state. Corrupt JSON or an unreadable file: the
        // page still works, but the user should know the previous pick is gone.
        logerr(`📼 local media: saved state could not be read — ${(err as Error)?.message ?? err}`); // non-info-level: caught storage exception — stack trace needed
        setError('msg.epub_file_unreadable');
      }
    })();
  }, []);

  // ── Open media file ──
  const openFile = useCallback(async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['video/*', 'audio/*'],
        copyToCacheDirectory: false,
      });
    } catch (err) {
      // non-info-level: caught exception from a native module — stack needed.
      logerr(`📼 local media: the file picker failed — ${(err as Error)?.message ?? err}`);
      setError('msg.epub_file_unreadable');
      return;
    }

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    // Copy to local media directory. The picked URI can already be dead (an
    // iCloud placeholder, a file deleted between the pick and the copy).
    const targetName = asset.name ?? 'media';
    const targetUri = `${MEDIA_DIR}${targetName}`;
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: targetUri });
    } catch (err) {
      logerr(`📼 local media: "${targetName}" could not be copied — ${(err as Error)?.message ?? err}`); // non-info-level: caught storage exception — stack trace needed
      setError('msg.epub_file_unreadable');
      return;
    }

    const audio = isAudioFile(targetName);

    setMediaUri(targetUri);
    setFileName(targetName);
    setIsAudio(audio);
    setHasMedia(true);
    setSubtitleLines([]);
    setSavedPosition(0);
    setError(null);

    await persistState({
      fileName: targetName,
      fileUri: targetUri,
      isAudio: audio,
      captionText: null,
      position: 0,
    });
  }, [persistState]);

  // ── Load subtitle file ──
  const loadCaptions = useCallback(async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/x-subrip', 'application/octet-stream'],
        copyToCacheDirectory: false,
      });
    } catch (err) {
      // non-info-level: caught exception from a native module — stack needed.
      logerr(`📼 local media: the caption picker failed — ${(err as Error)?.message ?? err}`);
      setError('msg.epub_file_unreadable');
      return;
    }

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    let text: string;
    try {
      text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      logerr(`📼 local media: "${asset.name}" could not be read — ${(err as Error)?.message ?? err}`); // non-info-level: caught storage exception — stack trace needed
      setError('msg.epub_file_unreadable');
      return;
    }

    let lines: SubtitleLine[];
    try {
      lines = parseSubtitles(text);
    } catch (err) {
      logwarn(`📼 local media: "${asset.name}" is not a readable subtitle file — ${(err as Error)?.message ?? err}`);
      setError('msg.epub_file_unreadable');
      return;
    }
    setSubtitleLines(lines);
    setError(null);

    const current = storageRef.current;
    await persistState({
      ...current,
      captionText: text,
    });
  }, [persistState]);

  // ── Clear ──
  const clear = useCallback(async () => {
    setError(null);
    try {
      await FileSystem.deleteAsync(MEDIA_DIR, { idempotent: true });
    } catch {
      // ignore
    }
    setMediaUri(null);
    setFileName(null);
    setIsAudio(false);
    setSubtitleLines([]);
    setHasMedia(false);
    setSavedPosition(0);

    await persistState({
      fileName: null,
      fileUri: null,
      isAudio: false,
      captionText: null,
      position: 0,
    });
  }, [persistState]);

  // ── Save position ──
  const savePosition = useCallback(
    (seconds: number) => {
      setSavedPosition(seconds);
      const current = storageRef.current;
      persistState({ ...current, position: seconds });
    },
    [persistState],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    mediaUri,
    isAudio,
    fileName,
    subtitleLines,
    hasMedia,
    savedPosition,
    openFile,
    loadCaptions,
    clear,
    savePosition,
    error,
    clearError,
  };
}
