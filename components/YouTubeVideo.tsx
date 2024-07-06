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
    inVideoWithTranscriptProvider = true;
    seekTime = context.seekTime;
  } catch (error) {
    // not in the VideoWithTranscriptProvider
  }

  const onChangeState = (newState: PLAYER_STATES) => {
    if (!inVideoWithTranscriptProvider) return;
    if (newState !== playbackState) updatePlaybackState(newState);
  };

  // Assuming playerRef and other state variables are defined here
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // To store the interval ID

  
  if (inVideoWithTranscriptProvider) {
    // Use the useEffect hook to run the interval, so we don't accidentally set up multiple intervals
    useEffect(() => {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set the interval and store its ID
      intervalRef.current = setInterval(async () => {
        if (!playerRef.current) return;
        if (!inVideoWithTranscriptProvider) return;
        const newTime = await playerRef.current.getCurrentTime();
        if (playbackState === PLAYER_STATES.PLAYING && newTime !== currentTime) {
          // console.log("NT ", newTime);
          updateCurrentTime(newTime); // Use newTime to reflect the updated value
        }
      }, 200);
      
      if (seekTime && playerRef.current?.seekTo) {
        // Only seek if the currentTime is different from the current time of the video by 100ms
        playerRef.current.seekTo(currentTime, true); // The second allowSeekAhead parameter determines whether the player will make a new request to the server if the seconds parameter specifies a time outside of the currently buffered video data.
        resetSeekTime();
      }

      // Cleanup function to clear the interval
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null; // Reset interval reference to null after clearing it
        }
      };
    }, [playbackState, seekTime, inVideoWithTranscriptProvider, currentTime, updateCurrentTime]); // Added necessary dependencies
  }

  // Update the duration of the video once it's loaded
  const onReady = async () => {
    if (!inVideoWithTranscriptProvider) return;
    if (!playerRef.current) return;
    const duration = await playerRef.current.getDuration();
    updateDuration(duration);
  };

  return (
    <YoutubePlayer
      videoId={youtubeId}
      play={playVideo} // Control playback of video with true/false
      mute={mute} // Control sound
      height={height}
      ref={playerRef}
      onReady={onReady}
      onChangeState={onChangeState}
      webViewProps={{
        allowsFullscreenVideo: true,
        allowsInlineMediaPlayback: true,
      }}
      webViewStyle={{
        opacity: 0.99, // This is a known trick to prevent a black screen on initial render in some Android devices
      }}
      // Additional player options can be set here
      initialPlayerParams={{
        start: Math.floor(startTime), // Must be integer otherwise won't work
        cc_lang_pref: "us", // Closed captions language
        showClosedCaptions: true,
        controls, // Use the controls prop to toggle visibility
        rel: false, // This ensures that related videos are not shown from other channels.
        modestbranding: true, // This limits YouTube branding as much as possible
      }}
      key={`${youtubeId}-${startTime}`}
    />
  );
};
