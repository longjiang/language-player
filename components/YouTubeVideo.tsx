// @/components/YouTubeVideo.tsx

import { useRef, useEffect, useCallback } from "react";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";
import { useVideoWithTranscriptContext, VideoWithTranscriptContextType } from "@/contexts/VideoWithTranscriptContext";
import { View } from "react-native";
import { ThemedText } from "./ThemedText";
import { PLAYER_STATES } from "react-native-youtube-iframe";

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

  const onChangeState = useCallback((newState: PLAYER_STATES) => {
    if (!inVideoWithTranscriptProvider) return;
    if (newState !== playbackState) {
      updatePlaybackState(newState);
      // Update play state when video starts playing or pauses
      if (newState === PLAYER_STATES.PLAYING) {
        updatePlayVideo(true);
      } else if (newState === PLAYER_STATES.PAUSED) {
        updatePlayVideo(false);
      }
    }
  }, [inVideoWithTranscriptProvider, playbackState, updatePlaybackState, updatePlayVideo]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (inVideoWithTranscriptProvider) {
    useEffect(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(async () => {
        if (!playerRef.current) return;
        if (!inVideoWithTranscriptProvider) return;
        const newTime = await playerRef.current.getCurrentTime();
        if (playbackState === PLAYER_STATES.PLAYING && newTime !== currentTime) {
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
      }}
      key={`${youtubeId}-${startTime}`}
    />
  );
};