import React from "react";
import YoutubePlayer from "react-native-youtube-iframe";

export const YouTubePlayer = ({ videoId, autoplay, mute, height = 300, controls = true }) => {
  return (
    <YoutubePlayer
      videoId={videoId}
      play={autoplay} // Control playback of video with true/false
      mute={mute} // Control sound
      height={height}
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
