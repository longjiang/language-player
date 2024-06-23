// @/components/YouTubeVideo.tsx

import { useRef, useEffect, useCallback } from "react";
import YoutubePlayer from "react-native-youtube-iframe";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";

// Define a PlayerState string type with the following possible values:
// unstarted - fired before the first video is loaded
// video cue- next video cue
// buffering - current video is in playing state but stopped for buffering
// playing - current video is playing
// paused	- current video is paused
// ended - video has finished playing the video
type PlayerState =
  | "unstarted"
  | "video cue"
  | "buffering"
  | "playing"
  | "paused"
  | "ended";

export const YouTubeVideo = ({
  youtubeId,
  autoplay,
  mute,
  height = 300,
  controls = true,
}) => {
  const playerRef = useRef();
  let playbackState: PlayerState;
  let currentTime: number;
  let inVideoWithTranscriptProvider = false;
  let playVideo = autoplay;
  let resetSeekTime: () => void;
  let updatePlaybackState: (state: PlayerState) => void;
  let updateCurrentTime: (time: number, isSeeking?: boolean) => void;
  let updateDuration: (duration: number) => void;

  // Determine if I'm in the VideoWithTranscriptProvider with try/catch
  // If in the provider, get the playbackState currentTime values, and the updatePlaybackState, and updateCurrentTime functions
  try {
    ({
      playbackState,
      currentTime,
      seekTime,
      playVideo,
      resetSeekTime,
      updatePlaybackState,
      updateCurrentTime,
      updateDuration,
    } = useVideoWithTranscriptContext());
    inVideoWithTranscriptProvider = true;
  } catch (error) {
    // not in the VideoWithTranscriptProvider
  }

  const onChangeState = (newState: PlayerState) => {
    if (!inVideoWithTranscriptProvider) return;
    if (newState !== playbackState) updatePlaybackState(newState);
  };

  // Assuming playerRef and other state variables are defined here
  const intervalRef = useRef(null); // To store the interval ID

  // Use the useEffect hook to run the interval, so we don't accidentally set up multiple intervals
  useEffect(() => {
    if (!inVideoWithTranscriptProvider) return;

    // Set the interval and store its ID
    intervalRef.current = setInterval(async () => {
      if (!playerRef.current) return;
      if (!inVideoWithTranscriptProvider) return;
      const newTime = await playerRef.current.getCurrentTime();
      if (playbackState === "playing" && newTime !== currentTime) {
        // console.log("NT ", newTime);
        updateCurrentTime(newTime); // Use newTime to reflect the updated value
      }
    }, 200);

    // Cleanup function to clear the interval
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [playbackState]);

  // Use the useEffect hook to run the interval, so we don't accidentally set up multiple intervals
  useEffect(() => {
    if (seekTime && playerRef.current.seekTo) {
      // Only seek if the currentTime is different from the current time of the video by 100ms

      playerRef.current.seekTo(currentTime, true); // The second allowSeekAhead parameter determines whether the player will make a new request to the server if the seconds parameter specifies a time outside of the currently buffered video data.
      resetSeekTime();
    }
  }, [seekTime]);

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
        cc_lang_pref: "us", // Closed captions language
        showClosedCaptions: true,
        controls, // Use the controls prop to toggle visibility
        rel: false, // This ensures that related videos are not shown from other channels.
        modestbranding: true, // This limits YouTube branding as much as possible
      }}
    />
  );
};
