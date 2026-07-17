// @/components/YouTubeVideo.tsx

import { useRef, useEffect, useCallback, useState } from "react";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";
import { useVideoWithTranscriptContext, VideoWithTranscriptContextType } from "@/contexts/VideoWithTranscriptContext";
import { View } from "react-native";
import { ThemedText } from "./ThemedText";
import { PLAYER_STATES } from "react-native-youtube-iframe";
import { PLAYER_STATES as APP_STATES } from "@/constants/PlayerStates";

export const YouTubeVideo: React.FC<{
  youtubeId: string;
  autoplay?: boolean;
  mute?: boolean;
  startTime?: number;
  height?: number;
  controls?: boolean;
}> = ({
  youtubeId,
  autoplay = false,
  mute = false,
  startTime = 0,
  height = 300,
  controls = true,
}) => {
  const playerRef = useRef<YoutubeIframeRef>(null); // Correctly type the ref with YoutubeIframeRef
  let playbackState: PLAYER_STATES = PLAYER_STATES.UNSTARTED;
  let currentTime: number;
  let inVideoWithTranscriptProvider = false;
  let playVideo = autoplay;
  let seekTime: number | undefined;
  let resetSeekTime: () => void;
  let updatePlaybackState: (state: PLAYER_STATES) => void;
  let updateCurrentTime: (time: number, isSeeking?: boolean) => void;
  let updateDuration: (duration: number) => void;
  let updatePlayVideo: (isPlaying: boolean) => void;

  // Determine if I'm in the VideoWithTranscriptProvider with try/catch
  // If in the provider, get the playbackState currentTime values, and the updatePlaybackState, and updateCurrentTime functions
  try {
    const context = useVideoWithTranscriptContext();
    playbackState = context.playbackState;
    currentTime = context.currentTime;
    resetSeekTime = context.resetSeekTime;
    updatePlaybackState = context.updatePlaybackState;
    updateCurrentTime = context.updateCurrentTime;
    updateDuration = context.updateDuration;
    playVideo = context.playVideo;
    updatePlayVideo = context.updatePlayVideo;
    inVideoWithTranscriptProvider = true;
    seekTime = context.seekTime;
  } catch (error) {
    // not in the VideoWithTranscriptProvider
  }

  // Map library string states → context numeric states
  const LIB_PLAYING = 'playing' as unknown as PLAYER_STATES;
  const LIB_PAUSED = 'paused' as unknown as PLAYER_STATES;

  const onChangeState = useCallback((newState: PLAYER_STATES) => {
    if (!inVideoWithTranscriptProvider) return;
    // Cast through unknown to pass string states to numeric context
    updatePlaybackState(newState as unknown as number);
    if (newState === LIB_PLAYING) {
      updatePlayVideo(true);
    } else if (newState === LIB_PAUSED) {
      updatePlayVideo(false);
    }
  }, [inVideoWithTranscriptProvider, updatePlaybackState, updatePlayVideo]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Force remount when play state changes (SDK 54 WebView play prop workaround)
  const [remountKey, setRemountKey] = useState(0);
  const prevPlayForRemount = useRef(playVideo);
  useEffect(() => {
    if (prevPlayForRemount.current !== playVideo) {
      prevPlayForRemount.current = playVideo;
      setRemountKey(k => k + 1);
    }
  }, [playVideo]);

  if (inVideoWithTranscriptProvider) {
    useEffect(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(async () => {
        if (!playerRef.current) return;
        if (!inVideoWithTranscriptProvider) return;
        const newTime = await playerRef.current.getCurrentTime();
        if (playbackState === (APP_STATES.PLAYING as any) && newTime !== currentTime) {
          updateCurrentTime(newTime);
        }
      }, 200);
      
      if (seekTime && playerRef.current?.seekTo) {
        playerRef.current.seekTo(currentTime, true);
        resetSeekTime();
      }

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [playbackState, seekTime, inVideoWithTranscriptProvider, currentTime, updateCurrentTime]);
  }

  const onReady = async () => {
    if (!inVideoWithTranscriptProvider) return;
    if (!playerRef.current) return;
    const duration = await playerRef.current.getDuration();
    updateDuration(duration);
  };

  return (
    <YoutubePlayer
      videoId={youtubeId}
      play={playVideo}
      mute={mute}
      height={height}
      ref={playerRef}
      onReady={onReady}
      onChangeState={onChangeState}
      webViewProps={{
        allowsFullscreenVideo: true,
        allowsInlineMediaPlayback: true,
        javaScriptEnabled: true,
        domStorageEnabled: true,
        mediaPlaybackRequiresUserAction: false,
      }}
      webViewStyle={{
        opacity: 0.99,
      }}
      initialPlayerParams={{
        start: Math.floor(startTime),
        cc_lang_pref: "us",
        showClosedCaptions: true,
        controls,
        rel: false,
        modestbranding: true,
        playsinline: 1,
      }}
        modestbranding: true,
      }}
      key={`${youtubeId}-${startTime}-${remountKey}`}
    />
  );
};